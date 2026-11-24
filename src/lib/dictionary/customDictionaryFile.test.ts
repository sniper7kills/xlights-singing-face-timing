import { describe, expect, it } from 'vitest'
import {
  isEntryWord,
  parseCustomDictionary,
  writeCustomDictionary,
} from './customDictionaryFile.ts'

const ENTRIES = [
  { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' },
  { word: "SINGIN'", symbols: 'S IH1 NG IH0 N' },
]

describe('customDictionaryFile', () => {
  it('gives the same entries after a write and a parse', () => {
    expect(parseCustomDictionary(writeCustomDictionary(ENTRIES))).toEqual({
      entries: ENTRIES,
      skippedLines: [],
    })
  })

  it('writes one line for each entry with two spaces after the word', () => {
    const lines = writeCustomDictionary(ENTRIES).split('\n')

    expect(lines[0]).toMatch(/^;;;/)
    expect(lines.slice(1)).toEqual(['RUDOLPH  R UW1 D AA0 L F', "SINGIN'  S IH1 NG IH0 N", ''])
  })

  it('writes only the comment line for no entries', () => {
    expect(parseCustomDictionary(writeCustomDictionary([]))).toEqual({
      entries: [],
      skippedLines: [],
    })
  })

  it('ignores comment lines and empty lines, and reads CR LF line ends', () => {
    const text = ';;; my words\r\n\r\nRUDOLPH  R UW1 D AA0 L F\r\n   \r\n;;;\r\n'

    expect(parseCustomDictionary(text)).toEqual({
      entries: [ENTRIES[0]],
      skippedLines: [],
    })
  })

  it('changes lower case to upper case', () => {
    expect(parseCustomDictionary('rudolph  r uw1 d aa0 l f').entries).toEqual([ENTRIES[0]])
  })

  it('skips bad lines and reports their line numbers', () => {
    const text = [
      ';;; comment',
      'RUDOLPH  R UW1 D AA0 L F',
      'ROODOLF R UW1',
      'BLITZEN  B L IH1 T XX',
      'DASHER   D AE1 SH',
      'PRANCER  P R AE1  N S ER0',
      `${'A'.repeat(41)}  AH0`,
      'ZXQV  Z',
    ].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [ENTRIES[0], { word: 'ZXQV', symbols: 'Z' }],
      skippedLines: [3, 4, 5, 6, 7],
    })
  })

  it('normalises the word of each line', () => {
    expect(parseCustomDictionary('Rudolph!  R UW1 D AA0 L F').entries).toEqual([ENTRIES[0]])
  })

  it('skips a line whose word has no letter and reports its line number', () => {
    const text = ['--  T', '12  T', 'ZXQV  Z'].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [{ word: 'ZXQV', symbols: 'Z' }],
      skippedLines: [1, 2],
    })
  })

  it('skips a line whose normalised word has more than 40 characters', () => {
    const text = [`${'A'.repeat(41)}!  AH0`, `${'-'.repeat(5)}${'A'.repeat(40)}  AH0`].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [{ word: 'A'.repeat(40), symbols: 'AH0' }],
      skippedLines: [1],
    })
  })

  it('keeps the later line of two lines that give the same word and counts one entry', () => {
    const text = ['Rudolph  R UW1 D AA0 L F', 'ZXQV  Z', 'RUDOLPH!  R UW1 D UW0'].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [
        { word: 'RUDOLPH', symbols: 'R UW1 D UW0' },
        { word: 'ZXQV', symbols: 'Z' },
      ],
      skippedLines: [],
    })
  })

  it('accepts a word of 1 to 40 characters with no spaces', () => {
    expect(isEntryWord('A')).toBe(true)
    expect(isEntryWord('A'.repeat(40))).toBe(true)
    expect(isEntryWord('')).toBe(false)
    expect(isEntryWord('A'.repeat(41))).toBe(false)
    expect(isEntryWord('ROO DOLF')).toBe(false)
  })
})
