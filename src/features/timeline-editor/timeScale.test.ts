import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  followCursor,
  inRange,
  makeTimeScale,
  MAX_ZOOM,
  MIN_ZOOM,
  msToPx,
  pxToMs,
  rangeBetweenPx,
  rangeToPx,
  rulerTicks,
  scrollByPx,
  shownZoom,
  timeAtPx,
  visibleRange,
  wheelZoom,
  zoomAt,
  zoomStep,
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

  it.each([10, 100, 1000])(
    'puts a time at the same position at %i pixels for each second',
    (zoom) => {
      const scale = makeTimeScale({
        ...FULL_SONG,
        durationMs: 600_000,
        pxPerSecond: zoom,
        scrollMs: 500,
      })

      expect(msToPx(scale, 1500)).toBeCloseTo(zoom)
    },
  )

  it('stops the scroll offset where the song end reaches the right edge', () => {
    // 100 px for each second in 1000 px show 10 000 ms, so the offset stops at 10 000 ms.
    expect(makeTimeScale({ ...FULL_SONG, pxPerSecond: 100, scrollMs: 18_000 }).scrollMs).toBe(
      10_000,
    )
    expect(makeTimeScale({ ...FULL_SONG, pxPerSecond: 100, scrollMs: -50 }).scrollMs).toBe(0)
  })

  it('keeps the scroll offset at 0 for a song shorter than the width', () => {
    expect(makeTimeScale({ ...FULL_SONG, pxPerSecond: 10, scrollMs: 4000 }).scrollMs).toBe(0)
  })
})

describe('clampZoom and shownZoom', () => {
  it('keeps the zoom from 10 to 1000 pixels for each second', () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([10, 1000])
    expect(clampZoom(2)).toBe(10)
    expect(clampZoom(5000)).toBe(1000)
    expect(clampZoom(250)).toBe(250)
  })

  it('shows the zoom that fits the full song at the default zoom', () => {
    // 1000 px for 20 000 ms is 50 px for each second.
    expect(shownZoom(FULL_SONG)).toBe(50)
    expect(shownZoom({ ...FULL_SONG, durationMs: 900_000 })).toBe(10)
    expect(shownZoom({ ...FULL_SONG, pxPerSecond: 333.4 })).toBe(333)
  })
})

describe('zoomAt', () => {
  const view = { ...FULL_SONG, durationMs: 120_000, pxPerSecond: 100, scrollMs: 30_000 }

  it.each([
    [400, 250],
    [25, 700],
    [1000, 10],
  ])(
    'keeps the time under the pointer at %i pixels for each second, pointer at %i px',
    (zoom, pointerPx) => {
      const before = pxToMs(makeTimeScale(view), pointerPx)

      const next = zoomAt(view, zoom, pointerPx)

      expect(next.pxPerSecond).toBe(zoom)
      expect(pxToMs(makeTimeScale({ ...view, ...next }), pointerPx)).toBeCloseTo(before)
    },
  )

  it('stops the zoom at the limits of the slider', () => {
    expect(zoomAt(view, 5, 0).pxPerSecond).toBe(10)
    expect(zoomAt(view, 4000, 0).pxPerSecond).toBe(1000)
  })

  it('stops the scroll offset at the start of the song', () => {
    expect(zoomAt({ ...view, scrollMs: 0 }, 50, 500)).toEqual({ pxPerSecond: 50, scrollMs: 0 })
  })

  it('starts from the zoom that fits the full song at the default zoom', () => {
    // The full song of 20 000 ms in 1000 px is 50 px for each second, so 2000 ms is at 100 px.
    const next = zoomAt(FULL_SONG, 200, 100)

    expect(next).toEqual({ pxPerSecond: 200, scrollMs: 1500 })
  })
})

describe('zoomStep', () => {
  const view = { ...FULL_SONG, durationMs: 120_000, pxPerSecond: 100, scrollMs: 30_000 }

  it('zooms in and out by a factor of 1.5 at the centre of the editor', () => {
    const centreMs = pxToMs(makeTimeScale(view), 500)

    const zoomedIn = zoomStep(view, 1)
    const zoomedOut = zoomStep(view, -1)

    expect(zoomedIn.pxPerSecond).toBe(150)
    expect(zoomedOut.pxPerSecond).toBeCloseTo(66.667, 2)
    expect(pxToMs(makeTimeScale({ ...view, ...zoomedIn }), 500)).toBeCloseTo(centreMs)
  })

  it('stops at 1000 pixels for each second', () => {
    expect(zoomStep({ ...view, pxPerSecond: 900 }, 1).pxPerSecond).toBe(1000)
  })
})

describe('wheelZoom', () => {
  const view = { ...FULL_SONG, durationMs: 120_000, pxPerSecond: 100, scrollMs: 30_000 }

  it('doubles the zoom for a wheel step of -300 px and keeps the time under the pointer', () => {
    const before = pxToMs(makeTimeScale(view), 320)

    const next = wheelZoom(view, -300, 320)

    expect(next.pxPerSecond).toBeCloseTo(200)
    expect(pxToMs(makeTimeScale({ ...view, ...next }), 320)).toBeCloseTo(before)
  })

  it('halves the zoom for a wheel step of 300 px', () => {
    expect(wheelZoom(view, 300, 0).pxPerSecond).toBeCloseTo(50)
  })
})

describe('scrollByPx', () => {
  const view = { ...FULL_SONG, pxPerSecond: 100, scrollMs: 2000 }

  it('moves the scroll offset by the time of the distance', () => {
    expect(scrollByPx(view, 150)).toBe(3500)
    expect(scrollByPx(view, -100)).toBe(1000)
  })

  it('stops at the start and at the end of the song', () => {
    expect(scrollByPx(view, -1000)).toBe(0)
    expect(scrollByPx(view, 5000)).toBe(10_000)
  })

  it('keeps the offset at 0 at the default zoom', () => {
    expect(scrollByPx(FULL_SONG, 300)).toBe(0)
  })
})

describe('followCursor', () => {
  const view = { ...FULL_SONG, durationMs: 60_000, pxPerSecond: 100, scrollMs: 10_000 }

  it('returns null while the play cursor is in view', () => {
    expect(followCursor(view, 10_000)).toBeNull()
    expect(followCursor(view, 19_990)).toBeNull()
  })

  it('moves the play cursor to the left edge when it reaches the right edge', () => {
    expect(followCursor(view, 20_000)).toBe(20_000)
  })

  it('moves the view back to the play cursor when it is before the left edge', () => {
    expect(followCursor(view, 4000)).toBe(4000)
  })

  it('stops at the end of the song', () => {
    expect(followCursor(view, 55_000)).toBe(50_000)
  })

  it('returns null at the default zoom, because the full song is in view', () => {
    expect(followCursor({ ...view, pxPerSecond: null }, 60_000)).toBeNull()
  })
})

describe('timeAtPx and rangeBetweenPx', () => {
  const scale = { pxPerMs: 0.1, scrollMs: 1000 }

  it('gives the time at a position in whole milliseconds', () => {
    expect(timeAtPx(scale, 25.04, 20_000)).toBe(1250)
  })

  it('keeps the time inside the song', () => {
    expect(timeAtPx(scale, -500, 20_000)).toBe(0)
    expect(timeAtPx(scale, 5000, 20_000)).toBe(20_000)
  })

  it('gives the range in time order for a drag to the left', () => {
    expect(rangeBetweenPx(scale, 300, 100, 20_000)).toEqual({ startMs: 2000, endMs: 4000 })
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
