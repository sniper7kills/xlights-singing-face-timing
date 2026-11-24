import { describe, expect, it } from 'vitest'
import { formatTime } from './formatTime.ts'
import { parseTime } from './parseTime.ts'

describe('parseTime', () => {
  it('reads 0:12.350 as 12 350 ms', () => {
    expect(parseTime('0:12.350')).toBe(12_350)
  })

  it('reads the minutes', () => {
    expect(parseTime('2:05.007')).toBe(125_007)
    expect(parseTime('15:00.000')).toBe(900_000)
  })

  it('reads a short fraction as tenths or hundredths of a second', () => {
    expect(parseTime('0:12.3')).toBe(12_300)
    expect(parseTime('0:12.35')).toBe(12_350)
  })

  it('reads a time with no fraction', () => {
    expect(parseTime('1:02')).toBe(62_000)
  })

  it('ignores spaces before and after the time', () => {
    expect(parseTime('  0:01.500 ')).toBe(1500)
  })

  it('returns null for text that is not a time', () => {
    for (const text of [
      '',
      'abc',
      '12.350',
      '0:60.000',
      '0:5.000',
      '0:12.3500',
      '-0:01.000',
      '0:12.',
    ])
      expect(parseTime(text)).toBeNull()
  })

  it('gives back each time that formatTime writes', () => {
    for (const ms of [0, 50, 1500, 12_350, 59_999, 60_000, 899_950])
      expect(parseTime(formatTime(ms))).toBe(ms)
  })
})
