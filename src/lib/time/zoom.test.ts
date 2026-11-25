import { describe, expect, it } from 'vitest'
import {
  anchoredScrollMs,
  centredScrollMs,
  fitZoom,
  ratioZoom,
  revealScrollMs,
  zoomAnchorMs,
} from './zoom.ts'

const VISIBLE = { startMs: 10_000, endMs: 20_000 }

describe('zoomAnchorMs', () => {
  it('keeps the middle of a selected mark in view', () => {
    expect(
      zoomAnchorMs({ visible: VISIBLE, selected: { startMs: 12_000, endMs: 13_000 }, playMs: 0 }),
    ).toBe(12_500)
  })

  it('moves the middle of a selected mark that is partly in view to the edge of the view', () => {
    expect(
      zoomAnchorMs({ visible: VISIBLE, selected: { startMs: 19_000, endMs: 23_000 }, playMs: 0 }),
    ).toBe(20_000)
  })

  it('keeps the play cursor when the selected mark is out of view', () => {
    expect(
      zoomAnchorMs({ visible: VISIBLE, selected: { startMs: 0, endMs: 500 }, playMs: 15_000 }),
    ).toBe(15_000)
  })

  it('keeps the middle of the view when no selected mark and no play cursor is in view', () => {
    expect(zoomAnchorMs({ visible: VISIBLE, selected: undefined, playMs: 25_000 })).toBe(15_000)
  })
})

describe('anchoredScrollMs', () => {
  it('keeps the anchor at the same position after a zoom', () => {
    // At 0.1 px for each ms the anchor 22 000 is 1 200 px from the edge. At 0.15 px it stays there.
    const scrollMs = anchoredScrollMs(10_000, 0.1, 0.15, 22_000)

    expect((22_000 - scrollMs) * 0.15).toBeCloseTo(1200)
  })
})

describe('fitZoom and centredScrollMs', () => {
  it('shows a phoneme of 50 ms with a margin of 10% on each side', () => {
    const range = { startMs: 1000, endMs: 1050 }

    const zoom = fitZoom(range, 1000)

    expect(zoom * 0.05).toBeCloseTo(1000 / 1.2)
    expect(centredScrollMs(range, 1000, zoom)).toBeCloseTo(1025 - 0.5 * 60)
  })

  it('counts a range of 0 ms as 1 ms', () => {
    expect(fitZoom({ startMs: 5, endMs: 5 }, 120)).toBeCloseTo(100_000)
  })
})

describe('ratioZoom', () => {
  it('changes the zoom by more than 40% after 5 key presses', () => {
    expect(ratioZoom(31, 5) / 31).toBeGreaterThan(1.4)
    expect(ratioZoom(100, -1)).toBeCloseTo(100 / 1.1)
  })
})

describe('revealScrollMs', () => {
  it('scrolls the least to show all of a range that fits', () => {
    expect(revealScrollMs(10_000, 5000, { startMs: 14_000, endMs: 16_000 })).toBe(11_000)
    expect(revealScrollMs(10_000, 5000, { startMs: 9000, endMs: 9500 })).toBe(9000)
    expect(revealScrollMs(10_000, 5000, { startMs: 11_000, endMs: 12_000 })).toBe(10_000)
  })

  it('keeps the scroll offset for a range longer than the view', () => {
    expect(revealScrollMs(10_000, 5000, { startMs: 8000, endMs: 20_000 })).toBe(10_000)
  })
})
