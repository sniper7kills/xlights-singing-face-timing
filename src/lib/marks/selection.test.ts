import { describe, expect, it } from 'vitest'
import { FRAME_MS, mark, OTHER_VOICE, testMarks } from './fixtures.test-helpers.ts'
import { addRangeAt, existingIds, markOnNextLayer, marksBetween } from './selection.ts'
import { findMark } from './family.ts'

describe('marksBetween', () => {
  it('returns the marks of the layer from the anchor to the target in time order', () => {
    expect(marksBetween(testMarks(), 'w1', 'w3')).toEqual(['w1', 'w2', 'w3'])
  })

  it('returns the same marks when the target comes before the anchor', () => {
    expect(marksBetween(testMarks(), 'w3', 'w1')).toEqual(['w1', 'w2', 'w3'])
  })

  it('returns only the target when the anchor is on a different layer', () => {
    expect(marksBetween(testMarks(), 'p1', 'w3')).toEqual(['w3'])
  })

  it('returns only the target when the anchor is of a different voice', () => {
    const marks = [...testMarks(), mark('q2', { voiceId: OTHER_VOICE, startMs: 0, endMs: 500 })]

    expect(marksBetween(marks, 'q2', 'w2')).toEqual(['w2'])
  })

  it('returns only the target when no mark has the anchor id', () => {
    expect(marksBetween(testMarks(), 'gone', 'w2')).toEqual(['w2'])
  })

  it('returns no mark when no mark has the target id', () => {
    expect(marksBetween(testMarks(), 'w1', 'gone')).toEqual([])
  })
})

describe('addRangeAt', () => {
  it('returns a range of 10 frames from the time', () => {
    expect(addRangeAt(1234, FRAME_MS)).toEqual({ startMs: 1234, endMs: 1734 })
  })
})

describe('existingIds', () => {
  it('keeps the ids that name a mark, in the same order', () => {
    expect(existingIds(testMarks(), ['w3', 'gone', 'w1'])).toEqual(['w3', 'w1'])
  })
})

describe('markOnNextLayer', () => {
  const at = (id: string) => {
    const found = findMark(testMarks(), id)
    if (!found) throw new Error(`No test mark ${id}`)
    return found
  }

  it('goes up to the parent', () => {
    expect(markOnNextLayer(testMarks(), at('w2b'), 'up')?.id).toBe('w2')
    expect(markOnNextLayer(testMarks(), at('w2'), 'up')?.id).toBe('p1')
  })

  it('goes down to the first child in time', () => {
    expect(markOnNextLayer(testMarks(), at('p1'), 'down')?.id).toBe('w1')
    expect(markOnNextLayer(testMarks(), at('w3'), 'down')?.id).toBe('w3a')
  })

  it('finds no mark above a phrase, below a phoneme or below a phrase with no words', () => {
    expect(markOnNextLayer(testMarks(), at('p1'), 'up')).toBeUndefined()
    expect(markOnNextLayer(testMarks(), at('w1a'), 'down')).toBeUndefined()
    expect(markOnNextLayer(testMarks(), at('p3'), 'down')).toBeUndefined()
  })
})
