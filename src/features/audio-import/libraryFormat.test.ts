import { describe, expect, it } from 'vitest'
import {
  formatChangeDate,
  formatDuration,
  formatMegabytes,
  normalizeSongName,
} from './libraryFormat.ts'

describe('normalizeSongName', () => {
  it('removes the spaces at both ends', () => {
    expect(normalizeSongName('  Silent Night  ')).toBe('Silent Night')
  })

  it('accepts a name of 80 characters', () => {
    expect(normalizeSongName('a'.repeat(80))).toBe('a'.repeat(80))
  })

  it('rejects a name of 81 characters', () => {
    expect(normalizeSongName('a'.repeat(81))).toBeNull()
  })

  it('rejects a name that holds only spaces', () => {
    expect(normalizeSongName('   ')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('writes 28.9 seconds as 0:29', () => {
    expect(formatDuration(28_900)).toBe('0:29')
  })

  it('writes 161 seconds as 2:41', () => {
    expect(formatDuration(161_000)).toBe('2:41')
  })
})

describe('formatChangeDate', () => {
  const now = new Date(2026, 10, 24, 15, 30)

  it('writes the time for a change today', () => {
    expect(formatChangeDate(new Date(2026, 10, 24, 14, 2).toISOString(), now)).toBe(
      'Changed today 14:02',
    )
  })

  it('writes "yesterday" for a change yesterday', () => {
    expect(formatChangeDate(new Date(2026, 10, 23, 23, 59).toISOString(), now)).toBe(
      'Changed yesterday',
    )
  })

  it('writes the date for an earlier change', () => {
    expect(formatChangeDate(new Date(2026, 9, 19, 8, 0).toISOString(), now)).toBe(
      'Changed 2026-10-19',
    )
  })
})

describe('formatMegabytes', () => {
  it('writes one decimal below 10 MB', () => {
    expect(formatMegabytes(350_000)).toBe('0.3')
  })

  it('writes a whole number from 10 MB', () => {
    expect(formatMegabytes(512 * 1024 * 1024)).toBe('512')
  })
})
