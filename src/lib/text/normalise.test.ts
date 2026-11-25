import { describe, expect, it } from 'vitest'
import { isLyricsWord, normaliseForMatch } from './normalise.ts'

describe('normaliseForMatch', () => {
  it('removes the letter case', () => {
    expect(normaliseForMatch('HeLLo')).toBe('hello')
  })

  it('removes punctuation, apostrophes, hyphens and spaces', () => {
    expect(normaliseForMatch(` "Don't-stop!"`)).toBe('dontstop')
  })

  it('keeps digits and letters with accents', () => {
    expect(normaliseForMatch('Café9')).toBe('café9')
  })

  it('returns an empty string for a word with no letter and no digit', () => {
    expect(normaliseForMatch('...')).toBe('')
  })
})

describe('isLyricsWord', () => {
  it('accepts a part with a letter or a digit, and rejects &, an emoji and a dash', () => {
    expect(['night,', "'tis", '你好', '42'].map(isLyricsWord)).toEqual([true, true, true, true])
    expect(['&', '😀', '—', '-', '"()"'].map(isLyricsWord)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  })
})
