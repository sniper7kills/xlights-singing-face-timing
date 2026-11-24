import { describe, expect, it } from 'vitest'
import { previewDelete } from './deleteRules.ts'
import { after } from './editRules.test-helpers.ts'
import { testMarks } from './fixtures.test-helpers.ts'
import { isEmptyEdit } from './markEdit.ts'

describe('previewDelete', () => {
  it('removes a phrase with its words and their phonemes', () => {
    const edit = previewDelete(testMarks(), ['p1'])

    expect(edit.removedIds.toSorted()).toEqual(
      ['p1', 'w1', 'w1a', 'w1b', 'w2', 'w2a', 'w2b', 'w3', 'w3a', 'w3b', 'w3c'].toSorted(),
    )
    expect(after(edit).p2).toBeDefined()
  })

  it('removes a word with its phonemes and keeps its phrase', () => {
    const edit = previewDelete(testMarks(), ['w2'])

    expect(edit.removedIds.toSorted()).toEqual(['w2', 'w2a', 'w2b'])
    expect(edit.changed).toEqual([])
  })

  it('removes a phoneme and sets edited on its word', () => {
    const edit = previewDelete(testMarks(), ['w3b'])

    expect(edit.removedIds).toEqual(['w3b'])
    expect(after(edit).w3?.edited).toBe(true)
    expect(after(edit).w3c?.startMs).toBe(2600)
  })

  it('ignores the last phoneme of a word when the ids hold all its phonemes', () => {
    const edit = previewDelete(testMarks(), ['w1a', 'w1b'])

    expect(edit.removedIds).toEqual(['w1a'])
    expect(after(edit).w1b).toBeDefined()
  })

  it('gives an empty edit for the only phoneme left in a word', () => {
    const marks = testMarks().filter((mark) => mark.id !== 'w1a')

    expect(isEmptyEdit(previewDelete(marks, ['w1b']))).toBe(true)
  })

  it('removes all phonemes of a word that the ids also delete', () => {
    const edit = previewDelete(testMarks(), ['w1a', 'w1b', 'w1'])

    expect(edit.removedIds.toSorted()).toEqual(['w1', 'w1a', 'w1b'])
    expect(edit.changed).toEqual([])
  })

  it('gives an empty edit for unknown ids', () => {
    expect(isEmptyEdit(previewDelete(testMarks(), ['nothing']))).toBe(true)
  })
})
