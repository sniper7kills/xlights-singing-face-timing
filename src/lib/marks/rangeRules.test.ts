import { describe, expect, it } from 'vitest'
import { after, childrenAfter, counterIds, range } from './editRules.test-helpers.ts'
import { mark, testMarks, VOICE } from './fixtures.test-helpers.ts'
import { isEmptyEdit } from './markEdit.ts'
import { overlapsRange, previewRangeClear } from './rangeRules.ts'

function clear(startMs: number, endMs: number) {
  return previewRangeClear(testMarks(), VOICE, { startMs, endMs }, counterIds())
}

const PHRASE = mark('p', { layer: 'phrase', startMs: 1000, endMs: 3000 })

describe('overlapsRange', () => {
  it('is true for a mark that crosses an edge of the range', () => {
    expect(overlapsRange(PHRASE, { startMs: 2900, endMs: 4000 })).toBe(true)
  })

  it('is false for a mark that only touches an edge of the range', () => {
    expect(overlapsRange(PHRASE, { startMs: 3000, endMs: 4000 })).toBe(false)
  })
})

describe('previewRangeClear', () => {
  it('removes each word that overlaps the range with its phonemes', () => {
    const edit = clear(1700, 2300)

    expect(edit.removedIds.toSorted()).toEqual(
      ['w2', 'w2a', 'w2b', 'w3', 'w3a', 'w3b', 'w3c'].toSorted(),
    )
  })

  it('ends a phrase that crosses the start of the range at its last kept word', () => {
    const marks = after(clear(1700, 2900))

    expect(range(marks.p1)).toEqual([1000, 1500])
    expect(marks.p1?.label).toBe('silent')
  })

  it('starts a phrase that crosses the end of the range at the start of its first kept word', () => {
    const marks = after(clear(2900, 3100))

    expect(range(marks.p2)).toEqual([3200, 5000])
    expect(marks.p2?.label).toBe('night')
    expect(marks.w4).toEqual(testMarks().find((mark) => mark.id === 'w4'))
  })

  it('divides a phrase that contains the range into two phrases that keep their words', () => {
    const edit = clear(1600, 2100)
    const marks = after(edit)

    expect(range(marks.p1)).toEqual([1000, 1500])
    expect(marks.p1?.label).toBe('silent')
    expect(range(marks.new1)).toEqual([2200, 3000])
    expect(marks.new1).toMatchObject({ layer: 'phrase', label: 'holy', voiceId: VOICE })
    expect(childrenAfter(edit, 'new1').map((mark) => mark.id)).toEqual(['w3'])
    expect(childrenAfter(edit, 'w3').map((mark) => mark.id)).toEqual(['w3a', 'w3b', 'w3c'])
  })

  it('removes a phrase that has no word left after the range', () => {
    const edit = clear(3100, 6500)

    expect(edit.removedIds).toEqual(expect.arrayContaining(['p2', 'w4', 'p3']))
  })

  it('keeps the times, labels and phonemes of the words outside the range', () => {
    const edit = clear(1600, 2100)
    const before = testMarks().filter((item) => ['w1', 'w1a', 'w1b', 'w3a'].includes(item.id))

    expect(before.map((item) => after(edit)[item.id])).toEqual(before)
    expect(after(edit).w3).toEqual({
      ...testMarks().find((item) => item.id === 'w3'),
      parentId: 'new1',
    })
  })

  it('changes no mark of another voice', () => {
    const edit = clear(0, 10_000)

    expect(after(edit).q1).toEqual(testMarks().at(-1))
  })

  it('gives an empty edit for a range in a gap between phrases', () => {
    expect(isEmptyEdit(clear(5000, 6000))).toBe(true)
  })
})
