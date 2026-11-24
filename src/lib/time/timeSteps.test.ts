import { describe, expect, it } from 'vitest'
import { extendRange, stepTime } from './timeSteps.ts'

describe('stepTime', () => {
  it('moves a time on a frame by one frame size in each direction', () => {
    expect(stepTime(1000, 1, 50, 10_000)).toBe(1050)
    expect(stepTime(1000, -1, 50, 10_000)).toBe(950)
  })

  it('moves a time between two frames to the nearer frame in that direction', () => {
    expect(stepTime(1020, 1, 50, 10_000)).toBe(1050)
    expect(stepTime(1020, -1, 50, 10_000)).toBe(1000)
  })

  it('stops at 0 and at the last frame of the song', () => {
    expect(stepTime(0, -1, 50, 10_000)).toBe(0)
    expect(stepTime(10_000, 1, 50, 10_020)).toBe(10_000)
  })
})

describe('extendRange', () => {
  it('starts a new selection at the play cursor when no selection exists', () => {
    expect(extendRange(null, 1000, 1050)).toEqual({ startMs: 1000, endMs: 1050 })
    expect(extendRange(null, 1000, 950)).toEqual({ startMs: 950, endMs: 1000 })
  })

  it('moves the edge at the play cursor and keeps the other edge', () => {
    const selection = { startMs: 1000, endMs: 1100 }

    expect(extendRange(selection, 1100, 1150)).toEqual({ startMs: 1000, endMs: 1150 })
    expect(extendRange(selection, 1000, 1050)).toEqual({ startMs: 1050, endMs: 1100 })
  })

  it('starts a new selection when the play cursor is at no edge of the selection', () => {
    expect(extendRange({ startMs: 0, endMs: 500 }, 2000, 2050)).toEqual({
      startMs: 2000,
      endMs: 2050,
    })
  })

  it('returns null when the result is empty', () => {
    expect(extendRange({ startMs: 1000, endMs: 1050 }, 1050, 1000)).toBeNull()
  })
})
