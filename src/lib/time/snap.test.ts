import { describe, expect, it } from 'vitest'
import { snap } from './snap.ts'

describe('snap', () => {
  it('moves a time down to the nearest multiple of 50 ms', () => {
    expect(snap(1224, 50)).toBe(1200)
  })

  it('moves a time up to the nearest multiple of 50 ms', () => {
    expect(snap(1226, 50)).toBe(1250)
  })

  it('moves a time to the nearest multiple of 25 ms', () => {
    expect(snap(1237.4, 25)).toBe(1225)
  })

  it('keeps a time that is a multiple of the frame size', () => {
    expect(snap(2500, 25)).toBe(2500)
  })

  it('moves a fraction of a millisecond to the nearest frame', () => {
    expect(snap(37.6, 25)).toBe(50)
  })
})
