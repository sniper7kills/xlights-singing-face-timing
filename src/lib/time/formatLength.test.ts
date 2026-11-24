import { describe, expect, it } from 'vitest'
import { formatLength } from './formatLength.ts'

describe('formatLength', () => {
  it('shows the milliseconds and the frames', () => {
    expect(formatLength(800, 50)).toBe('800 ms · 16 frames')
    expect(formatLength(800, 25)).toBe('800 ms · 32 frames')
  })

  it('writes one frame in the singular', () => {
    expect(formatLength(50, 50)).toBe('50 ms · 1 frame')
  })

  it('rounds a length that is not a multiple of the frame size to the nearest frame', () => {
    expect(formatLength(130, 50)).toBe('130 ms · 3 frames')
  })
})
