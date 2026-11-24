import { describe, expect, it } from 'vitest'
import { FRAME_MS, mark, OTHER_VOICE, testMarks } from './fixtures.test-helpers.ts'
import { addRangeAt, marksBetween } from './selection.ts'

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
