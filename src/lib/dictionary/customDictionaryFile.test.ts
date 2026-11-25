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
      skipped: [],
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
      skipped: [],
    })
  })

  it('ignores comment lines and empty lines, and reads CR LF line ends', () => {
    const text = ';;; my words\r\n\r\nRUDOLPH  R UW1 D AA0 L F\r\n   \r\n;;;\r\n'

    expect(parseCustomDictionary(text)).toEqual({
      entries: [ENTRIES[0]],
      skipped: [],
    })
  })

  it('changes lower case to upper case', () => {
    expect(parseCustomDictionary('rudolph  r uw1 d aa0 l f').entries).toEqual([ENTRIES[0]])
  })

  it('skips bad lines and reports the line number and the cause of each', () => {
    const text = [
      ';;; comment',
      'RUDOLPH  R UW1 D AA0 L F',
      'ROODOLF R UW1',
      'BLITZEN  B L IH1 T XX',
      'DASHER   D AE1 SH',
      'PRANCER  P R AE1  N S ER0',
      `${'A'.repeat(41)}  AH0`,
      'ZXQV  Z',
      'COMET',
      'CUPID  ',
    ].join('\n')
    const spaces = 'use two spaces after the word and one space between the symbols.'

    expect(parseCustomDictionary(text)).toEqual({
      entries: [ENTRIES[0], { word: 'ZXQV', symbols: 'Z' }],
      skipped: [
        { line: 3, reason: spaces },
        { line: 4, reason: '“XX” is not a symbol.' },
        { line: 5, reason: spaces },
        { line: 6, reason: spaces },
        { line: 7, reason: 'the word has more than 40 characters.' },
        { line: 9, reason: 'no symbols.' },
        { line: 10, reason: 'no symbols.' },
      ],
    })
  })

  it('normalises the word of each line', () => {
    expect(parseCustomDictionary('Rudolph!  R UW1 D AA0 L F').entries).toEqual([ENTRIES[0]])
  })

  it('skips a line whose word has no letter and reports its line number', () => {
    const text = ['--  T', '12  T', "'  T", "''  T", 'ZXQV  Z'].join('\n')
    const reason = 'the word has no letter.'

    expect(parseCustomDictionary(text)).toEqual({
      entries: [{ word: 'ZXQV', symbols: 'Z' }],
      skipped: [1, 2, 3, 4].map((line) => ({ line, reason })),
    })
  })

  it('skips a line whose normalised word has more than 40 characters', () => {
    const text = [`${'A'.repeat(41)}!  AH0`, `${'-'.repeat(5)}${'A'.repeat(40)}  AH0`].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [{ word: 'A'.repeat(40), symbols: 'AH0' }],
      skipped: [{ line: 1, reason: 'the word has more than 40 characters.' }],
    })
  })

  it('keeps the later line of two lines that give the same word and counts one entry', () => {
    const text = ['Rudolph  R UW1 D AA0 L F', 'ZXQV  Z', 'RUDOLPH!  R UW1 D UW0'].join('\n')

    expect(parseCustomDictionary(text)).toEqual({
      entries: [
        { word: 'RUDOLPH', symbols: 'R UW1 D UW0' },
        { word: 'ZXQV', symbols: 'Z' },
      ],
      skipped: [],
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
