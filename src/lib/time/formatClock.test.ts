import { describe, expect, it } from 'vitest'
import { formatClock } from './formatClock.ts'

describe('formatClock', () => {
  it('shows 1:12 at 72 seconds', () => {
    expect(formatClock(72_000)).toBe('1:12')
  })

  it('shows 3:40 at 220 seconds', () => {
    expect(formatClock(220_000)).toBe('3:40')
  })

  it('drops the fraction of a second', () => {
    expect(formatClock(59_999)).toBe('0:59')
  })

  it('pads the seconds with a zero', () => {
    expect(formatClock(65_000)).toBe('1:05')
  })

  it('shows minutes above 9 without a limit', () => {
    expect(formatClock(14 * 60_000 + 3000)).toBe('14:03')
  })

  it('shows 0:00 for a negative time', () => {
    expect(formatClock(-500)).toBe('0:00')
  })
})
