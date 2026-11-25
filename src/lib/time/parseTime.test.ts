import { describe, expect, it } from 'vitest'
import { formatTime } from './formatTime.ts'
import { parseTime, readTime } from './parseTime.ts'

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

  it('reads plain seconds', () => {
    expect(parseTime('3.5')).toBe(3500)
    expect(parseTime('12.350')).toBe(12_350)
    expect(parseTime('7')).toBe(7000)
  })

  it('adds seconds of 60 or more to the minutes', () => {
    expect(parseTime('0:99.000')).toBe(99_000)
  })

  it('returns null for text that is not a time', () => {
    for (const text of ['', 'abc', '0:5.000', '0:12.3500', '-0:01.000', '0:12.', '3.', '1:2:03'])
      expect(parseTime(text)).toBeNull()
  })

  it('gives back each time that formatTime writes', () => {
    for (const ms of [0, 50, 1500, 12_350, 59_999, 60_000, 899_950])
      expect(parseTime(formatTime(ms))).toBe(ms)
  })
})

describe('readTime', () => {
  it('gives the milliseconds of a time inside the song', () => {
    expect(readTime('3.5', 10_000)).toEqual({ ms: 3500 })
    expect(readTime('0:10.000', 10_000)).toEqual({ ms: 10_000 })
  })

  it('gives one error for each cause', () => {
    expect(readTime('  ', 10_000)).toEqual({ error: 'Type a time, for example 0:03.500 or 3.5.' })
    expect(readTime('-1', 10_000)).toEqual({ error: 'Type a time of 0 or more.' })
    expect(readTime('abc', 10_000)).toEqual({
      error: 'Use m:ss.mmm or seconds, for example 0:03.500 or 3.5.',
    })
    expect(readTime('0:99.000', 28_900)).toEqual({ error: 'The song ends at 0:28.900.' })
  })
})
