import { describe, expect, it } from 'vitest'
import type { Mark } from '../../store/types.ts'
import { after, childrenAfter, counterIds, range } from './editRules.test-helpers.ts'
import { FRAME_MS, mark, testMarks } from './fixtures.test-helpers.ts'
import { isEmptyEdit } from './markEdit.ts'
import { previewSplit, splitTime } from './splitRules.ts'

function split(id: string, atMs: number, marks: Mark[] = testMarks()) {
  return previewSplit(marks, id, atMs, FRAME_MS, counterIds())
}

describe('splitTime', () => {
  const word = mark('w', { startMs: 1000, endMs: 1500 })

  it('snaps the time to the frame size', () => {
    expect(splitTime([word], word, 1224, FRAME_MS)).toBe(1200)
  })

  it('gives undefined for a time outside the mark', () => {
    expect(splitTime([word], word, 900, FRAME_MS)).toBeUndefined()
    expect(splitTime([word], word, 1600, FRAME_MS)).toBeUndefined()
  })

  it('gives undefined when a part is shorter than one frame size', () => {
    expect(splitTime([word], word, 1020, FRAME_MS)).toBeUndefined()
    expect(splitTime([word], word, 1480, FRAME_MS)).toBeUndefined()
  })
})

describe('previewSplit of a word', () => {
  it('makes two words with the label divided in proportion to the split time', () => {
    const edit = split('w1', 1150)

    expect(after(edit).w1).toMatchObject({ label: 'si', startMs: 1000, endMs: 1150 })
    expect(after(edit).new1).toMatchObject({
      label: 'lent',
      startMs: 1150,
      endMs: 1500,
      parentId: 'p1',
    })
    expect(edit.breakDownIds).toEqual(['w1', 'new1'])
  })

  it('gives each part the phonemes that it holds and divides the phoneme across the split time', () => {
    const edit = split('w1', 1150)

    expect(childrenAfter(edit, 'w1').map(range)).toEqual([[1000, 1150]])
    expect(childrenAfter(edit, 'new1').map((item) => [item.label, ...(range(item) ?? [])])).toEqual(
      [
        ['etc', 1150, 1250],
        ['AI', 1250, 1500],
      ],
    )
  })

  it('gives a part with no phoneme the phonemes of the guess', () => {
    const marks = testMarks().filter((item) => item.id !== 'w2a')

    const edit = split('w2', 1550, marks)

    expect(childrenAfter(edit, 'w2', marks).length).toBeGreaterThan(0)
    expect(childrenAfter(edit, 'w2', marks).every((item) => item.endMs <= 1550)).toBe(true)
  })

  it('keeps the divided phonemes of an edited word and asks for no break down', () => {
    const edit = split('w4', 3500)

    expect(edit.breakDownIds).toEqual([])
    expect(after(edit).w4?.edited).toBe(true)
    expect(after(edit).new1?.edited).toBe(true)
    expect(childrenAfter(edit, 'new1').map(range)).toEqual([
      [3500, 3600],
      [3600, 4000],
    ])
  })

  it('gives an empty edit for a time outside the word', () => {
    expect(isEmptyEdit(split('w1', 1700))).toBe(true)
  })
})

describe('previewSplit of a phrase', () => {
  it('makes two phrases and gives each phrase the words that lie in it', () => {
    const edit = split('p1', 2100)

    expect(after(edit).p1).toMatchObject({ label: 'silent night', startMs: 1000, endMs: 2100 })
    expect(after(edit).new1).toMatchObject({ label: 'holy', startMs: 2100, endMs: 3000 })
    expect(after(edit).w3?.parentId).toBe('new1')
    expect(after(edit).w2?.parentId).toBe('p1')
    expect(edit.breakDownIds).toBeUndefined()
  })

  it('moves a split time inside a word to the nearer edge of the word', () => {
    expect(after(split('p1', 1350)).p1?.endMs).toBe(1500)
    expect(after(split('p1', 1650)).p1?.endMs).toBe(1500)
  })

  it('gives an empty edit when the nearer word edge is the phrase edge', () => {
    expect(isEmptyEdit(split('p1', 1100))).toBe(true)
    // At equal distance the split moves to the word start, which is the phrase start here.
    expect(isEmptyEdit(split('p1', 1250))).toBe(true)
  })

  it('divides the label at the middle character when the label words do not match the words', () => {
    const edit = split('p3', 6500)

    expect(after(edit).p3?.label).toBe('all is')
    expect(after(edit).new1?.label).toBe('calm')
  })
})

describe('previewSplit of a phoneme', () => {
  it('makes two phonemes with the same label and sets edited on them and on the word', () => {
    const edit = split('w2b', 1800)

    expect(after(edit).w2b).toMatchObject({ label: 'AI', startMs: 1600, endMs: 1800, edited: true })
    expect(after(edit).new1).toMatchObject({
      label: 'AI',
      startMs: 1800,
      endMs: 2000,
      edited: true,
    })
    expect(after(edit).w2?.edited).toBe(true)
  })
})

it('gives an empty edit for an unknown id', () => {
  expect(isEmptyEdit(split('nothing', 1000))).toBe(true)
})
