import { describe, expect, it } from 'vitest'
import type { Mark } from '../../store/types.ts'
import { DURATION_MS, FRAME_MS, testMarks } from './fixtures.test-helpers.ts'
import { applyEdit, type MarkEdit } from './markEdit.ts'
import { previewMove, previewResize } from './moveRules.ts'

function resize(id: string, edge: 'start' | 'end', toMs: number, marks = testMarks()) {
  return previewResize(marks, id, edge, toMs, FRAME_MS, DURATION_MS)
}

function move(id: string, deltaMs: number, marks = testMarks()) {
  return previewMove(marks, id, deltaMs, FRAME_MS, DURATION_MS)
}

// Returns the marks after the edit, by id, so a test reads one mark with `after(edit).w1`.
function after(edit: MarkEdit, marks = testMarks()): Record<string, Mark> {
  return Object.fromEntries(applyEdit(marks, edit).map((item) => [item.id, item]))
}

function range(item: Mark | undefined) {
  return item && [item.startMs, item.endMs]
}

function phonemesOf(edit: MarkEdit, wordId: string, marks = testMarks()) {
  return applyEdit(marks, edit)
    .filter((item) => item.parentId === wordId)
    .sort((a, b) => a.startMs - b.startMs)
}

function withChange(id: string, fields: Partial<Mark>): Mark[] {
  return testMarks().map((item) => (item.id === id ? { ...item, ...fields } : item))
}

describe('previewResize', () => {
  it('snaps the dragged time to the frame size', () => {
    expect(range(after(resize('w3', 'end', 2913)).w3)).toEqual([2200, 2900])
    expect(range(after(resize('w3', 'start', 2124)).w3)).toEqual([2100, 2800])
  })

  it('keeps the mark one frame size long when the edge passes the other edge', () => {
    expect(range(after(resize('w3', 'start', 2990)).w3)).toEqual([2750, 2800])
    expect(range(after(resize('w3', 'end', 0)).w3)).toEqual([2200, 2250])
  })

  it('stops a word edge at the edge of its phrase when the person drags it past the parent edge', () => {
    expect(range(after(resize('w3', 'end', 3500)).w3)).toEqual([2200, 3000])
    expect(range(after(resize('w4', 'start', 3000)).w4)).toEqual([3000, 4000])
  })

  it('stops a phoneme edge at the edge of its word', () => {
    expect(range(after(resize('w3c', 'end', 2950)).w3c)).toEqual([2600, 2800])
    expect(resize('w3c', 'end', 2950)).toEqual({ changed: [], removedIds: [] })
  })

  it('moves the shared boundary of both words when the edge reaches the adjacent word and leaves no gap', () => {
    const result = after(resize('w1', 'end', 1700))

    expect(range(result.w1)).toEqual([1000, 1700])
    expect(range(result.w2)).toEqual([1700, 2000])
  })

  it('moves a shared boundary back so that a shorter word leaves no gap', () => {
    const result = after(resize('w1', 'end', 1300))

    expect(range(result.w1)).toEqual([1000, 1300])
    expect(range(result.w2)).toEqual([1300, 2000])
  })

  it('moves the shared boundary back when the start edge reaches the previous word', () => {
    const result = after(resize('w3', 'start', 1800))

    expect(range(result.w3)).toEqual([1800, 2800])
    expect(range(result.w2)).toEqual([1500, 1800])
  })

  it('stops the drag when the adjacent word is one frame size long', () => {
    const result = after(resize('w1', 'end', 2600))

    expect(range(result.w1)).toEqual([1000, 1950])
    expect(range(result.w2)).toEqual([1950, 2000])
  })

  it('stops the drag when an adjacent edited word has one frame size for each phoneme', () => {
    const marks = withChange('w2', { edited: true })

    const result = after(resize('w1', 'end', 2600, marks), marks)

    expect(range(result.w1)).toEqual([1000, 1900])
    expect(range(result.w2)).toEqual([1900, 2000])
  })

  it('leaves a word after a gap unchanged until the edge reaches it', () => {
    const result = after(resize('w2', 'end', 2100))

    expect(range(result.w2)).toEqual([1500, 2100])
    expect(range(result.w3)).toEqual([2200, 2800])
  })

  it('stops a phrase edge at its first or last word and keeps the times of its words', () => {
    const start = resize('p2', 'start', 3500)
    const end = resize('p2', 'end', 3500)

    expect(range(after(start).p2)).toEqual([3200, 5000])
    expect(range(after(end).p2)).toEqual([3000, 4000])
    // The previous phrase p1 touches p2, so the shared boundary moves with the start.
    expect(start.changed.map((item) => item.id)).toEqual(['p2', 'p1'])
    expect(end.changed.map((item) => item.id)).toEqual(['p2'])
  })

  it('lets a phrase with no words get as short as one frame size', () => {
    expect(range(after(resize('p3', 'end', 6000)).p3)).toEqual([6000, 6050])
  })

  it('pushes the adjacent phrase back only to its first word', () => {
    const result = after(resize('p1', 'end', 3800))

    expect(range(result.p1)).toEqual([1000, 3200])
    expect(range(result.p2)).toEqual([3200, 5000])
  })

  it('keeps a phrase at 0 or later and inside the song', () => {
    expect(range(after(resize('p1', 'start', -500)).p1)).toEqual([0, 3000])
    expect(range(after(resize('p3', 'end', 20_000)).p3)).toEqual([6000, 10_000])
  })

  it('stops at the last multiple of the frame size when the song length is not a multiple', () => {
    const edit = previewResize(testMarks(), 'p3', 'end', 20_000, FRAME_MS, 9990)

    expect(range(after(edit).p3)).toEqual([6000, 9950])
  })

  it('ignores the marks of other voices', () => {
    expect(range(after(resize('p1', 'start', 200)).p1)).toEqual([200, 3000])
  })

  it('spreads the phonemes of an unedited word that gets longer over the new length', () => {
    const phonemes = phonemesOf(resize('w3', 'end', 3000), 'w3')

    expect(phonemes.map((item) => item.label)).toEqual(['etc', 'O', 'L'])
    expect(phonemes[0]?.startMs).toBe(2200)
    expect(phonemes.at(-1)?.endMs).toBe(3000)
    for (const [index, item] of phonemes.entries())
      if (index > 0) expect(item.startMs).toBe(phonemes[index - 1]?.endMs)
  })

  it('drops phonemes of an unedited word that gets shorter than one frame size for each phoneme', () => {
    const edit = resize('w3', 'end', 2200)

    expect(range(after(edit).w3)).toEqual([2200, 2250])
    expect(edit.removedIds).toHaveLength(2)
    expect(phonemesOf(edit, 'w3').map(range)).toEqual([[2200, 2250]])
  })

  it('scales the phonemes of an edited word with followWord', () => {
    const phonemes = phonemesOf(resize('w4', 'end', 4800), 'w4')

    expect(phonemes.map((item) => item.id)).toEqual(['w4a', 'w4b', 'w4c'])
    expect(phonemes.map(range)).toEqual([
      [3200, 3600],
      [3600, 4000],
      [4000, 4800],
    ])
  })

  it('keeps one frame size for each phoneme of an edited word', () => {
    const edit = resize('w4', 'end', 3200)

    expect(range(after(edit).w4)).toEqual([3200, 3350])
    expect(phonemesOf(edit, 'w4').map(range)).toEqual([
      [3200, 3250],
      [3250, 3300],
      [3300, 3350],
    ])
  })

  it('removes the "estimated" state of the resized mark only', () => {
    const result = after(resize('w2', 'end', 2400))

    expect(result.w2?.estimated).toBeUndefined()
    expect(result.w3?.estimated).toBe(true)
    expect(after(resize('w3', 'end', 2900)).w3?.estimated).toBe(false)
  })

  it('sets edited on a resized phoneme and on its word', () => {
    const result = after(resize('w3a', 'end', 2300))

    expect(range(result.w3a)).toEqual([2200, 2300])
    expect(range(result.w3b)).toEqual([2300, 2600])
    expect(result.w3a?.edited).toBe(true)
    expect(result.w3?.edited).toBe(true)
  })

  it('keeps the phoneme of the previous word when a phoneme start that touches it moves later', () => {
    const result = after(resize('w2a', 'start', 1550))

    expect(range(result.w2a)).toEqual([1550, 1600])
    expect(range(result.w1b)).toEqual([1250, 1500])
  })

  it('returns an empty edit for an unknown id or a time that changes nothing', () => {
    expect(resize('nothing', 'end', 100)).toEqual({ changed: [], removedIds: [] })
    expect(resize('w3', 'end', 2810)).toEqual({ changed: [], removedIds: [] })
  })
})

describe('previewMove', () => {
  it('snaps the amount to the frame size and keeps the length', () => {
    expect(range(after(move('w3', 73)).w3)).toEqual([2250, 2850])
    expect(range(after(move('w3', -76)).w3)).toEqual([2100, 2700])
  })

  it('stops a dragged word body at the adjacent word and does not jump over it', () => {
    expect(range(after(move('w3', -1000)).w3)).toEqual([2000, 2600])
    expect(range(after(move('w3', -1000)).w2)).toEqual([1500, 2000])
  })

  it('stops at the edge of the parent', () => {
    expect(range(after(move('w3', 1000)).w3)).toEqual([2400, 3000])
    expect(range(after(move('w4', -1000)).w4)).toEqual([3000, 3800])
  })

  it('moves the words of a phrase and their phonemes by the same amount', () => {
    const result = after(move('p2', 500))

    expect(range(result.p2)).toEqual([3500, 5500])
    expect(range(result.w4)).toEqual([3700, 4500])
    expect([result.w4a, result.w4b, result.w4c].map(range)).toEqual([
      [3700, 3900],
      [3900, 4100],
      [4100, 4500],
    ])
  })

  it('moves the phonemes of a word by the same amount and keeps their ids', () => {
    const edit = move('w3', 100)

    expect(phonemesOf(edit, 'w3').map((item) => [item.id, ...(range(item) ?? [])])).toEqual([
      ['w3a', 2300, 2500],
      ['w3b', 2500, 2700],
      ['w3c', 2700, 2900],
    ])
    expect(edit.removedIds).toEqual([])
  })

  it('stops a phrase at the adjacent phrase, at 0 and at the end of the song', () => {
    expect(range(after(move('p3', 5000)).p3)).toEqual([9000, 10_000])
    expect(range(after(move('p3', -5000)).p3)).toEqual([5000, 6000])
    expect(range(after(move('q1', 500)).q1)).toEqual([500, 2500])
    expect(move('q1', -500)).toEqual({ changed: [], removedIds: [] })
  })

  it('removes the "estimated" state of the moved word', () => {
    expect(after(move('w3', 100)).w3?.estimated).toBe(false)
  })

  it('sets edited on a moved phoneme and on its word', () => {
    const marks = testMarks().filter((item) => item.id !== 'w3b')

    const result = after(move('w3a', 100, marks), marks)

    expect(range(result.w3a)).toEqual([2300, 2500])
    expect(result.w3a?.edited).toBe(true)
    expect(result.w3?.edited).toBe(true)
  })

  it('returns an empty edit for an unknown id, an amount under half a frame or a mark with no room', () => {
    expect(move('nothing', 100)).toEqual({ changed: [], removedIds: [] })
    expect(move('w3', 20)).toEqual({ changed: [], removedIds: [] })
    expect(move('w1', -100)).toEqual({ changed: [], removedIds: [] })
  })
})
