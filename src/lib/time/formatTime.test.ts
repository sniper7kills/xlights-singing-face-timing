import { describe, expect, it } from 'vitest'
import { formatTime } from './formatTime.ts'

describe('formatTime', () => {
  it('shows 0:01.500 at 1.5 seconds', () => {
    expect(formatTime(1500)).toBe('0:01.500')
  })

  it('shows 0:00.000 at time 0', () => {
    expect(formatTime(0)).toBe('0:00.000')
  })

  it('pads the seconds and the milliseconds with zeros', () => {
    expect(formatTime(61_005)).toBe('1:01.005')
  })

  it('shows minutes above 9 without a limit', () => {
    expect(formatTime(14 * 60_000 + 59_999)).toBe('14:59.999')
  })

  it('rounds a fraction to the nearest millisecond', () => {
    expect(formatTime(1234.6)).toBe('0:01.235')
  })

  it('carries a rounded fraction into the next second', () => {
    expect(formatTime(59_999.7)).toBe('1:00.000')
  })
})
