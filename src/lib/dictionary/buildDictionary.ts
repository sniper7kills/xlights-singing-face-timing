import type { Dictionary } from './types.ts'

// A variant entry such as `hello(2)` carries a number after the word.
const WORD = /^([^\s()#]+)(?:\(\d+\))?$/
// This checks the entry format only. Issue #22 owns the list of CMU symbols.
const SYMBOL = /^[A-Z]+[0-2]?$/

/** A line of `cmudict.dict` does not have the entry format. */
export class DictionaryFormatError extends Error {
  constructor(lineNumber: number, line: string) {
    super(`cmudict.dict line ${lineNumber} is not an entry: ${JSON.stringify(line)}`)
    this.name = 'DictionaryFormatError'
  }
}

/**
 * Returns the dictionary that the text of `cmudict.dict` holds.
 * Each line is a word, one space, then its CMU symbols separated by one space.
 * A `#` starts a comment to the end of the line.
 * When a word has several entries, the dictionary keeps the first.
 * @param text The full text of `cmudict.dict`.
 * @throws DictionaryFormatError when a line that is not blank is not an entry.
 */
export function parseCmudict(text: string): Dictionary {
  const dictionary: Record<string, string> = {}
  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (line === '') return
    const [token = '', ...symbols] = line.split(/\s+/)
    const word = WORD.exec(token)?.[1]
    if (word === undefined || symbols.length === 0 || !symbols.every((s) => SYMBOL.test(s))) {
      throw new DictionaryFormatError(index + 1, rawLine)
    }
    const key = word.toUpperCase()
    if (!Object.hasOwn(dictionary, key)) dictionary[key] = symbols.join(' ')
  })
  return dictionary
}

/**
 * Returns the bytes of `public/dict/cmudict.json` for the text of `cmudict.dict`.
 * The same text always gives the same output, so the committed file can be checked.
 * @throws DictionaryFormatError when a line is not an entry.
 */
export function buildDictionaryJson(text: string): string {
  return `${JSON.stringify(parseCmudict(text))}\n`
}
