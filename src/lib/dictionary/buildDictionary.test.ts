import { describe, expect, it } from 'vitest'
import cmudictText from '../../../vendor/cmudict/cmudict.dict?raw'
import committedJson from '../../../public/dict/cmudict.json?raw'
import { buildDictionaryJson, DictionaryFormatError, parseCmudict } from './buildDictionary.ts'
import type { Dictionary } from './types.ts'

describe('parseCmudict', () => {
  it('maps each word in upper case to its CMU symbols with the stress digits', () => {
    expect(parseCmudict('hello HH AH0 L OW1\nstar S T AA1 R\n')).toEqual({
      HELLO: 'HH AH0 L OW1',
      STAR: 'S T AA1 R',
    })
  })

  it('keeps the first entry when a word has variant entries', () => {
    const text = 'hello HH AH0 L OW1\nhello(2) HH EH0 L OW1\nhello(3) HH EH1 L OW0\n'

    expect(parseCmudict(text)).toEqual({ HELLO: 'HH AH0 L OW1' })
  })

  it('keeps the first entry when a variant entry comes before the word', () => {
    expect(parseCmudict('read(2) R EH1 D\nread R IY1 D\n')).toEqual({ READ: 'R EH1 D' })
  })

  it('removes a comment that starts with # to the end of the line', () => {
    const text = 'aalborg AO1 L B AO0 R G # place, danish\n# a full comment line\n'

    expect(parseCmudict(text)).toEqual({ AALBORG: 'AO1 L B AO0 R G' })
  })

  it('keeps the apostrophes and the dots in a word', () => {
    const text = "'bout B AW1 T\nsingin' S IH1 NG IH0 N\nd.c. D IY2 S IY1\n"

    expect(parseCmudict(text)).toEqual({
      "'BOUT": 'B AW1 T',
      "SINGIN'": 'S IH1 NG IH0 N',
      'D.C.': 'D IY2 S IY1',
    })
  })

  it('skips blank lines and accepts Windows line ends', () => {
    expect(parseCmudict('\r\nstar S T AA1 R\r\n\r\n')).toEqual({ STAR: 'S T AA1 R' })
  })

  it.each([
    ['a word with no symbols', 'star\n', 1],
    ['a variant marker with no number', 'star() S T AA1 R\n', 1],
  ])('rejects %s and names the line number', (_name, text, lineNumber) => {
    const parse = () => parseCmudict(text)

    expect(parse).toThrow(DictionaryFormatError)
    expect(parse).toThrow(`cmudict.dict line ${lineNumber} is not an entry`)
  })
})

describe('parseCmudict, symbols', () => {
  it.each([
    ['a symbol in lower case', 'ok OW2 K EY1\nstar s t aa1 r\n', 2, 'star', 's'],
    ['a stress digit above 2', 'star S T AA3 R\n', 1, 'star', 'AA3'],
    ['an upper-case token that is not a CMU symbol', 'star S T XX R\n', 1, 'star', 'XX'],
    ['a consonant with a stress digit', 'hello(2) HH1 EH0 L OW1\n', 1, 'hello', 'HH1'],
  ])('rejects %s and names the word and the symbol', (_name, text, lineNumber, word, symbol) => {
    const parse = () => parseCmudict(text)

    expect(parse).toThrow(DictionaryFormatError)
    expect(parse).toThrow(
      `cmudict.dict line ${lineNumber}: the word "${word}" has "${symbol}", which is not a CMU symbol.`,
    )
  })
})

describe('public/dict/cmudict.json', () => {
  const dictionary = JSON.parse(committedJson) as Dictionary

  it('holds the first entries of HELLO and STAR', () => {
    expect(dictionary.HELLO).toBe('HH AH0 L OW1')
    expect(dictionary.STAR).toBe('S T AA1 R')
  })

  it('holds one entry for each of the 126052 words of the vendored file', () => {
    expect(Object.keys(dictionary)).toHaveLength(126052)
  })

  it('equals a fresh build from vendor/cmudict/cmudict.dict', () => {
    expect(buildDictionaryJson(cmudictText) === committedJson).toBe(true)
  })
})
