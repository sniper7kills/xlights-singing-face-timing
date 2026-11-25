import { describe, expect, it } from 'vitest'
import { activityToRanges, firstRangeNumbers, renumberByFirstRange } from './segments.ts'

const frames = (pattern: string) => [...pattern].map((mark) => mark === '#')
const settings = { frameMs: 100, minGapMs: 0, minRangeMs: 0 }

describe('activityToRanges', () => {
  it('gives one range for each run of active frames', () => {
    expect(activityToRanges(frames('.##..#'), 2, settings)).toEqual([
      { startMs: 100, endMs: 300, singer: 2 },
      { startMs: 500, endMs: 600, singer: 2 },
    ])
  })

  it('joins two ranges across a gap shorter than the gap limit', () => {
    expect(activityToRanges(frames('##.##..##'), 0, { ...settings, minGapMs: 200 })).toEqual([
      { startMs: 0, endMs: 500, singer: 0 },
      { startMs: 700, endMs: 900, singer: 0 },
    ])
  })

  it('drops a range shorter than the range limit after the joins', () => {
    expect(activityToRanges(frames('#...###'), 0, { ...settings, minRangeMs: 300 })).toEqual([
      { startMs: 400, endMs: 700, singer: 0 },
    ])
  })

  it('rounds the times to whole milliseconds', () => {
    expect(activityToRanges(frames('.#'), 0, { ...settings, frameMs: 16.875 })).toEqual([
      { startMs: 17, endMs: 34, singer: 0 },
    ])
  })

  it('gives no range for no active frame', () => {
    expect(activityToRanges(frames('...'), 0, settings)).toEqual([])
  })
})

describe('renumberByFirstRange', () => {
  it('sorts the ranges by start and numbers the singers in the order of their first range', () => {
    const ranges = [
      { startMs: 500, endMs: 900, singer: 4 },
      { startMs: 0, endMs: 400, singer: 7 },
      { startMs: 300, endMs: 600, singer: 4 },
      { startMs: 1000, endMs: 1200, singer: 7 },
    ]
    expect(renumberByFirstRange(ranges)).toEqual([
      { startMs: 0, endMs: 400, singer: 0 },
      { startMs: 300, endMs: 600, singer: 1 },
      { startMs: 500, endMs: 900, singer: 1 },
      { startMs: 1000, endMs: 1200, singer: 0 },
    ])
  })
})

describe('firstRangeNumbers', () => {
  it('numbers the singers 0, 1, 2 in the order of their first range', () => {
    const numbers = firstRangeNumbers([
      { startMs: 500, endMs: 900, singer: 4 },
      { startMs: 0, endMs: 400, singer: 7 },
      { startMs: 1000, endMs: 1200, singer: 2 },
    ])
    expect([...numbers]).toEqual([
      [7, 0],
      [4, 1],
      [2, 2],
    ])
  })

  it('gives an empty map for no range', () => {
    expect(firstRangeNumbers([]).size).toBe(0)
  })
})
