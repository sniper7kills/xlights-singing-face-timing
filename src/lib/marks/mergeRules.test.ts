import { describe, expect, it } from 'vitest'
import { after, childrenAfter, range } from './editRules.test-helpers.ts'
import { testMarks } from './fixtures.test-helpers.ts'
import { isEmptyEdit } from './markEdit.ts'
import { previewMerge } from './mergeRules.ts'

describe('previewMerge', () => {
  it('merges two words into one word that spans both, with the labels joined with no space', () => {
    const edit = previewMerge(testMarks(), 'w1')

    expect(after(edit).w1).toMatchObject({ label: 'silentnight', startMs: 1000, endMs: 2000 })
    expect(edit.removedIds).toEqual(['w2'])
    expect(childrenAfter(edit, 'w1').map((item) => item.id)).toEqual(['w1a', 'w1b', 'w2a', 'w2b'])
    expect(edit.breakDownIds).toEqual(['w1'])
  })

  it('spans the gap between two words', () => {
    expect(range(after(previewMerge(testMarks(), 'w2')).w2)).toEqual([1500, 2800])
  })

  it('keeps the phonemes of a merged word when one word is edited', () => {
    const marks = testMarks().map((item) => (item.id === 'w2' ? { ...item, edited: true } : item))

    const edit = previewMerge(marks, 'w1')

    expect(after(edit, marks).w1?.edited).toBe(true)
    expect(edit.breakDownIds).toEqual([])
  })

  it('merges two phrases with the labels joined with one space and keeps all words', () => {
    const edit = previewMerge(testMarks(), 'p1')

    expect(after(edit).p1).toMatchObject({
      label: 'silent night holy night',
      startMs: 1000,
      endMs: 5000,
    })
    expect(after(edit).w4?.parentId).toBe('p1')
    expect(edit.removedIds).toEqual(['p2'])
  })

  it('merges two phonemes with the first label and sets edited on the phoneme and the word', () => {
    const edit = previewMerge(testMarks(), 'w1a')

    expect(after(edit).w1a).toMatchObject({
      label: 'etc',
      startMs: 1000,
      endMs: 1500,
      edited: true,
    })
    expect(after(edit).w1?.edited).toBe(true)
    expect(edit.removedIds).toEqual(['w1b'])
  })

  it('gives an empty edit for a next mark of a different parent', () => {
    expect(isEmptyEdit(previewMerge(testMarks(), 'w3'))).toBe(true)
    expect(isEmptyEdit(previewMerge(testMarks(), 'w1b'))).toBe(true)
  })

  it('gives an empty edit on the last mark of a layer', () => {
    expect(isEmptyEdit(previewMerge(testMarks(), 'p3'))).toBe(true)
    expect(isEmptyEdit(previewMerge(testMarks(), 'w4'))).toBe(true)
  })

  it('gives an empty edit for an unknown id', () => {
    expect(isEmptyEdit(previewMerge(testMarks(), 'nothing'))).toBe(true)
  })
})
