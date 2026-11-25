import { describe, expect, it } from 'vitest'
import {
  BASE_BUCKET,
  basePeaks,
  coarserLevel,
  peakLevels,
  pickLevel,
  type TrackPeaks,
  waveColumns,
} from './peaks.ts'

const MAX = 0x7fff

/** Returns a square wave: `period` samples at `high`, then `period` samples at `-high`, for `count` samples. */
function square(count: number, period: number, high: number): Int16Array {
  return Int16Array.from({ length: count }, (_, index) =>
    Math.floor(index / period) % 2 === 0 ? high : -high,
  )
}

function track(samples: Int16Array, startMs = 0, sampleRate = 1000): TrackPeaks {
  return { levels: peakLevels(samples), sampleRate, startMs, sampleCount: samples.length }
}

describe('basePeaks', () => {
  it('gives the lowest and the highest sample of each bucket', () => {
    const level = basePeaks(Int16Array.from([1, -5, 3, 7, -2, 4]), 3)
    expect(level.bucket).toBe(3)
    expect(Array.from(level.min)).toEqual([-5, -2])
    expect(Array.from(level.max)).toEqual([3, 7])
  })

  it('puts the samples that remain into a short last bucket', () => {
    const level = basePeaks(Int16Array.from([1, 2, 3, 4, 9]), 2)
    expect(Array.from(level.max)).toEqual([2, 4, 9])
    expect(Array.from(level.min)).toEqual([1, 3, 9])
  })

  it('gives no bucket for an empty track', () => {
    expect(basePeaks(new Int16Array(0)).min).toHaveLength(0)
  })
})

describe('coarserLevel', () => {
  it('joins two buckets into one bucket of double length', () => {
    const level = coarserLevel(basePeaks(Int16Array.from([1, -5, 3, 7, -2, 4, 8, 0]), 2))
    expect(level.bucket).toBe(4)
    expect(Array.from(level.min)).toEqual([-5, -2])
    expect(Array.from(level.max)).toEqual([7, 8])
  })

  it('keeps the last bucket of an odd count', () => {
    const level = coarserLevel(basePeaks(Int16Array.from([1, 2, 3, 4, 5, 6]), 2))
    expect(Array.from(level.max)).toEqual([4, 6])
  })
})

describe('peakLevels', () => {
  it('ends with one bucket that holds the peaks of the full track', () => {
    const levels = peakLevels(square(1000, 10, 1000))
    expect(levels[0]?.bucket).toBe(BASE_BUCKET)
    const last = levels.at(-1)
    expect(last?.min).toHaveLength(1)
    expect(last?.min[0]).toBe(-1000)
    expect(last?.max[0]).toBe(1000)
    expect(levels.map((level) => level.bucket)).toEqual(
      levels.map((_, index) => BASE_BUCKET * 2 ** index),
    )
  })

  it('gives one empty level for an empty track', () => {
    expect(peakLevels(new Int16Array(0))).toHaveLength(1)
  })
})

describe('pickLevel', () => {
  const levels = peakLevels(new Int16Array(4096))

  it('picks the coarsest level with one bucket or more for each pixel', () => {
    expect(pickLevel(levels, 100)?.bucket).toBe(64)
    expect(pickLevel(levels, 64)?.bucket).toBe(64)
  })

  it('picks the finest level when one pixel covers fewer samples than one bucket', () => {
    expect(pickLevel(levels, 3)?.bucket).toBe(BASE_BUCKET)
  })

  it('gives undefined with no level', () => {
    expect(pickLevel([], 10)).toBeUndefined()
  })
})

describe('waveColumns', () => {
  it('gives the low and the high value of each column from -1 to 1', () => {
    // 1 000 samples for each second and 0.1 px for each ms: each pixel covers 10 samples.
    const columns = waveColumns(track(square(1000, 5, MAX)), { pxPerMs: 0.1, scrollMs: 0 }, 4, null)
    expect(Array.from(columns)).toEqual([-1, 1, -1, 1, -1, 1, -1, 1])
  })

  it('draws only the part in view after a scroll', () => {
    const samples = new Int16Array(2000)
    // The first bucket of 64 samples in view starts at sample 960.
    samples.fill(MAX, 960)
    const columns = waveColumns(track(samples), { pxPerMs: 0.01, scrollMs: 1000 }, 2, null)
    expect(Array.from(columns)).toEqual([1, 1, 1, 1])
  })

  it('gives no audio before the start and after the end of a range track', () => {
    const columns = waveColumns(
      track(new Int16Array(1000).fill(MAX), 2000),
      { pxPerMs: 0.001, scrollMs: 0 },
      4,
      null,
    )
    expect(Array.from(columns)).toEqual([
      Number.NaN,
      Number.NaN,
      Number.NaN,
      Number.NaN,
      1,
      1,
      Number.NaN,
      Number.NaN,
    ])
  })

  it('gives no audio outside the gate', () => {
    const columns = waveColumns(
      track(new Int16Array(4000).fill(MAX)),
      { pxPerMs: 0.001, scrollMs: 0 },
      4,
      [{ startMs: 1000, endMs: 2000 }],
    )
    expect(Array.from(columns)).toEqual([
      Number.NaN,
      Number.NaN,
      1,
      1,
      Number.NaN,
      Number.NaN,
      Number.NaN,
      Number.NaN,
    ])
  })

  it('gives no audio for an empty track', () => {
    const columns = waveColumns(track(new Int16Array(0)), { pxPerMs: 1, scrollMs: 0 }, 2, null)
    expect(columns.every(Number.isNaN)).toBe(true)
  })

  it('gives no column for a width of 0', () => {
    expect(
      waveColumns(track(new Int16Array(10)), { pxPerMs: 1, scrollMs: 0 }, 0, null),
    ).toHaveLength(0)
  })

  it('gives no audio when the track has no level', () => {
    const empty: TrackPeaks = { levels: [], sampleRate: 1000, startMs: 0, sampleCount: 0 }
    expect(waveColumns(empty, { pxPerMs: 1, scrollMs: 0 }, 1, null).every(Number.isNaN)).toBe(true)
  })
})
