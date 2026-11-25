import { describe, expect, it } from 'vitest'
import type { Mark } from '../../store/types.ts'
import { after, childrenAfter, counterIds, range } from './editRules.test-helpers.ts'
import { FRAME_MS, mark, testMarks } from './fixtures.test-helpers.ts'
import { phraseWordsChange, previewLabel, previewPhonemeLabel } from './labelRules.ts'
import { isEmptyEdit } from './markEdit.ts'

function relabel(id: string, label: string, marks: Mark[] = testMarks()) {
  return previewLabel(marks, id, label, FRAME_MS, counterIds())
}

describe('phraseWordsChange', () => {
  it('gives false for the same words with other case and punctuation', () => {
    expect(phraseWordsChange(testMarks(), 'p1', 'Silent, night! HOLY')).toBe(false)
  })

  it('gives true for fewer, more or other words', () => {
    expect(phraseWordsChange(testMarks(), 'p1', 'silent night')).toBe(true)
    expect(phraseWordsChange(testMarks(), 'p1', 'silent night holy night')).toBe(true)
    expect(phraseWordsChange(testMarks(), 'p1', 'silent day holy')).toBe(true)
  })

  it('gives false for an empty label, a word and an unknown id', () => {
    expect(phraseWordsChange(testMarks(), 'p1', '   ')).toBe(false)
    expect(phraseWordsChange(testMarks(), 'w1', 'day')).toBe(false)
    expect(phraseWordsChange(testMarks(), 'nothing', 'day')).toBe(false)
  })
})

describe('previewLabel', () => {
  it('keeps the old label for an empty label on a phrase or a word', () => {
    expect(isEmptyEdit(relabel('p1', ''))).toBe(true)
    expect(isEmptyEdit(relabel('w1', '   '))).toBe(true)
  })

  it('gives an empty edit for the same label and for an unknown id', () => {
    expect(isEmptyEdit(relabel('w1', ' silent '))).toBe(true)
    expect(isEmptyEdit(relabel('nothing', 'day'))).toBe(true)
  })

  it('replaces the phonemes of a word with a new label and asks for a break down', () => {
    const marks = testMarks().map((item) => (item.id === 'w1' ? { ...item, unknown: true } : item))

    const edit = relabel('w1', 'quiet', marks)

    expect(after(edit, marks).w1).toMatchObject({ label: 'quiet', startMs: 1000, endMs: 1500 })
    expect(after(edit, marks).w1).not.toHaveProperty('unknown')
    expect(edit.removedIds).toEqual(['w1a', 'w1b'])
    expect(childrenAfter(edit, 'w1', marks).length).toBeGreaterThan(0)
    expect(edit.breakDownIds).toEqual(['w1'])
  })

  it('clears edited on a word with a new label', () => {
    expect(after(relabel('w4', 'day')).w4?.edited).toBe(false)
  })

  it('changes only the label of a phrase with the same words', () => {
    const edit = relabel('p1', 'Silent night, holy!')

    expect(edit).toEqual({
      changed: [expect.objectContaining({ id: 'p1', label: 'Silent night, holy!' })],
      removedIds: [],
    })
  })

  it('keeps the times of the words that match and gives the free time to a new word', () => {
    const edit = relabel('p1', 'silent day holy')
    const words = childrenAfter(edit, 'p1')

    expect(words.map((item) => [item.id, item.label, ...(range(item) ?? [])])).toEqual([
      ['w1', 'silent', 1000, 1500],
      ['new1', 'day', 1500, 2200],
      ['w3', 'holy', 2200, 2800],
    ])
    expect(edit.removedIds.toSorted()).toEqual(['w2', 'w2a', 'w2b'])
    expect(after(edit).new1?.estimated).toBe(true)
    expect(edit.breakDownIds).toEqual(['new1'])
  })

  it('breaks down a matched word with a changed spelling and keeps its time', () => {
    const edit = relabel('p1', 'Silent night holy night')

    expect(after(edit).w1).toMatchObject({ label: 'Silent', startMs: 1000, endMs: 1500 })
    expect(edit.breakDownIds).toContain('w1')
    expect(range(childrenAfter(edit, 'p1').at(-1))).toEqual([2800, 3000])
  })

  it('takes 3 frames from the matched word before a new word that has no free time', () => {
    const edit = relabel('p1', 'silent and night holy')

    expect(range(after(edit).w1)).toEqual([1000, 1350])
    expect(range(after(edit).new1)).toEqual([1350, 1500])
    expect(range(after(edit).w2)).toEqual([1500, 2000])
    expect(childrenAfter(edit, 'w1').every((item) => item.endMs <= 1350)).toBe(true)
  })

  it('spreads the phonemes of an edited word again when it has no frame for each phoneme', () => {
    const marks = [
      mark('p', { layer: 'phrase', label: 'x', startMs: 0, endMs: 500 }),
      mark('w', { label: 'x', startMs: 0, endMs: 150, parentId: 'p', edited: true }),
      mark('a', { layer: 'phoneme', label: 'etc', startMs: 0, endMs: 50, parentId: 'w' }),
      mark('b', { layer: 'phoneme', label: 'AI', startMs: 50, endMs: 100, parentId: 'w' }),
      mark('c', { layer: 'phoneme', label: 'O', startMs: 100, endMs: 150, parentId: 'w' }),
    ]

    const edit = relabel('p', 'a x', marks)

    expect(after(edit, marks).w).toMatchObject({ startMs: 50, endMs: 150, edited: false })
    expect(
      childrenAfter(edit, 'w', marks).every((item) => item.endMs - item.startMs >= FRAME_MS),
    ).toBe(true)
  })

  it('shares a phrase with no words between the new words', () => {
    const words = childrenAfter(relabel('p3', 'all is bright'), 'p3')

    expect(words.map(range)).toEqual([
      [6000, 6300],
      [6300, 6650],
      [6650, 7000],
    ])
  })

  it('sets the label of a phoneme through the phoneme rule', () => {
    expect(after(relabel('w1a', 'O')).w1a).toMatchObject({ label: 'O', edited: true })
  })
})

describe('previewPhonemeLabel', () => {
  it('sets the label and sets edited on the phoneme and its word', () => {
    const edit = previewPhonemeLabel(testMarks(), 'w2b', 'O')

    expect(after(edit).w2b).toMatchObject({ label: 'O', edited: true })
    expect(after(edit).w2?.edited).toBe(true)
  })

  it('gives an empty edit for a label that is not one of the ten labels, the same label or a word', () => {
    expect(isEmptyEdit(previewPhonemeLabel(testMarks(), 'w2b', 'ai'))).toBe(true)
    expect(isEmptyEdit(previewPhonemeLabel(testMarks(), 'w2b', 'AI'))).toBe(true)
    expect(isEmptyEdit(previewPhonemeLabel(testMarks(), 'w2', 'AI'))).toBe(true)
  })
})
