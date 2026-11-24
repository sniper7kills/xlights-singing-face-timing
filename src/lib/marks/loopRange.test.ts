import { describe, expect, it } from 'vitest'
import { testMarks } from './fixtures.test-helpers.ts'
import { loopRange } from './loopRange.ts'

describe('loopRange', () => {
  it('starts 150 ms before the selected mark and ends at its end', () => {
    expect(loopRange(testMarks(), ['w2'], null)).toEqual({ startMs: 1350, endMs: 2000 })
  })

  it('spans all selected marks from the earliest start to the latest end', () => {
    expect(loopRange(testMarks(), ['w3', 'w1'], null)).toEqual({ startMs: 850, endMs: 2800 })
  })

  it('uses the time selection when no mark is selected', () => {
    expect(loopRange(testMarks(), [], { startMs: 5000, endMs: 5600 })).toEqual({
      startMs: 4850,
      endMs: 5600,
    })
  })

  it('prefers the selected mark to the time selection', () => {
    expect(loopRange(testMarks(), ['w2'], { startMs: 5000, endMs: 5600 })).toEqual({
      startMs: 1350,
      endMs: 2000,
    })
  })

  it('uses the time selection when the selected id names no mark', () => {
    expect(loopRange(testMarks(), ['gone'], { startMs: 5000, endMs: 5600 })?.startMs).toBe(4850)
  })

  it('starts at 0 for a selection less than 150 ms after the song start', () => {
    expect(loopRange(testMarks(), ['q1'], null)).toEqual({ startMs: 0, endMs: 2000 })
  })

  it('returns null when nothing is selected', () => {
    expect(loopRange(testMarks(), [], null)).toBeNull()
  })

  it('returns null for an empty time selection', () => {
    expect(loopRange(testMarks(), [], { startMs: 5000, endMs: 5000 })).toBeNull()
  })
})
