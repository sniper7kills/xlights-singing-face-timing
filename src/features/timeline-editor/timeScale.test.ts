import { describe, expect, it } from 'vitest'
import {
  inRange,
  makeTimeScale,
  msToPx,
  pxToMs,
  rangeToPx,
  rulerTicks,
  visibleRange,
} from './timeScale.ts'

const FULL_SONG = { widthPx: 1000, durationMs: 20_000, pxPerSecond: null, scrollMs: 0 }

describe('makeTimeScale', () => {
  it('fits the full song in the width at the default zoom', () => {
    const scale = makeTimeScale(FULL_SONG)

    expect(scale).toEqual({ pxPerMs: 0.05, scrollMs: 0 })
    expect(msToPx(scale, 20_000)).toBe(1000)
  })

  it('ignores the scroll offset at the default zoom', () => {
    expect(makeTimeScale({ ...FULL_SONG, scrollMs: 4000 }).scrollMs).toBe(0)
  })

  it('uses the zoom and the scroll offset of the view store', () => {
    const scale = makeTimeScale({ ...FULL_SONG, pxPerSecond: 200, scrollMs: 4000 })

    expect(scale).toEqual({ pxPerMs: 0.2, scrollMs: 4000 })
    expect(msToPx(scale, 4000)).toBe(0)
    expect(msToPx(scale, 5000)).toBe(200)
  })
})

describe('msToPx and pxToMs', () => {
  it('converts a position back to the same time', () => {
    const scale = { pxPerMs: 0.2, scrollMs: 1500 }

    expect(pxToMs(scale, msToPx(scale, 7350))).toBeCloseTo(7350)
  })

  it('gives a negative position for a time before the scroll offset', () => {
    expect(msToPx({ pxPerMs: 0.1, scrollMs: 2000 }, 1000)).toBe(-100)
  })
})

describe('rangeToPx', () => {
  it('gives the left position and the width of a mark', () => {
    expect(rangeToPx({ pxPerMs: 0.1, scrollMs: 1000 }, { startMs: 1500, endMs: 4000 })).toEqual({
      leftPx: 50,
      widthPx: 250,
    })
  })
})

describe('visibleRange', () => {
  it('starts at the scroll offset and spans the width', () => {
    expect(visibleRange({ pxPerMs: 0.1, scrollMs: 2000 }, 500)).toEqual({
      startMs: 2000,
      endMs: 7000,
    })
  })
})

describe('inRange', () => {
  const marks = [
    { id: 'a', startMs: 0, endMs: 1000 },
    { id: 'b', startMs: 1000, endMs: 2500 },
    { id: 'c', startMs: 2500, endMs: 4000 },
    { id: 'd', startMs: 4000, endMs: 5000 },
  ]

  it('keeps the marks that overlap the range, also the partly visible marks', () => {
    expect(inRange(marks, { startMs: 1500, endMs: 4000 }).map((mark) => mark.id)).toEqual([
      'b',
      'c',
    ])
  })

  it('drops a mark that ends at the start of the range', () => {
    expect(inRange(marks, { startMs: 1000, endMs: 1200 }).map((mark) => mark.id)).toEqual(['b'])
  })

  it('keeps 3 000 marks down to the marks in view', () => {
    const many = Array.from({ length: 3000 }, (_, index) => ({
      startMs: index * 100,
      endMs: index * 100 + 100,
    }))

    expect(inRange(many, { startMs: 10_000, endMs: 15_000 })).toHaveLength(50)
  })
})

describe('rulerTicks', () => {
  it('uses the shortest step that keeps the ticks 80 pixels apart', () => {
    // 0.05 px/ms: 1 s is 50 px and 2 s is 100 px.
    expect(rulerTicks({ pxPerMs: 0.05, scrollMs: 0 }, 1000)).toEqual([
      0, 2000, 4000, 6000, 8000, 10_000, 12_000, 14_000, 16_000, 18_000,
    ])
  })

  it('starts at the first multiple of the step after the scroll offset', () => {
    expect(rulerTicks({ pxPerMs: 1, scrollMs: 1050 }, 300)).toEqual([1100, 1200, 1300])
  })

  it('uses steps of one minute for a long song in a narrow width', () => {
    // 0.0001 px/ms: 100 px show 1 000 000 ms, and one minute is only 6 px.
    const ticks = rulerTicks({ pxPerMs: 0.0001, scrollMs: 0 }, 100)

    expect(ticks.slice(0, 3)).toEqual([0, 60_000, 120_000])
    expect(ticks).toHaveLength(17)
  })
})
