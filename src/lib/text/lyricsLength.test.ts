import { describe, expect, it } from 'vitest'
import { lyricsTooLong, MAX_LYRICS_LENGTH } from './lyricsLength.ts'

describe('lyricsTooLong', () => {
  it('accepts lyrics of 20 000 characters', () => {
    expect(MAX_LYRICS_LENGTH).toBe(20_000)
    expect(lyricsTooLong('a'.repeat(20_000))).toBe(false)
  })

  it('refuses lyrics of 20 001 characters', () => {
    expect(lyricsTooLong('a'.repeat(20_001))).toBe(true)
  })
})
