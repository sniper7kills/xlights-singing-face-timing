import { describe, expect, it } from 'vitest'
import { snap } from './snap.ts'

describe('snap', () => {
  it('keeps a time that is a multiple of the frame size', () => {
    expect(snap(100, 50)).toBe(100)
  })

  it('moves a time down to the nearer multiple', () => {
    expect(snap(124, 50)).toBe(100)
  })

  it('moves a time up to the nearer multiple', () => {
    expect(snap(126, 50)).toBe(150)
  })

  it('moves a time exactly between two multiples to the later multiple', () => {
    expect(snap(125, 50)).toBe(150)
  })

  it('snaps a fraction of a millisecond with a frame size of 25 ms', () => {
    expect(snap(37.4, 25)).toBe(25)
  })
})
