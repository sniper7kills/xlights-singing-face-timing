import { findCmuSymbol } from './cmuSymbols.ts'
import type { Dictionary } from './types.ts'

// A variant entry such as `hello(2)` carries a number after the word.
const WORD = /^([^\s()#]+)(?:\(\d+\))?$/

/** A line of `cmudict.dict` does not have the entry format, or has an item that is not a CMU symbol. */
export class DictionaryFormatError extends Error {
  constructor(lineNumber: number, problem: string) {
    super(`cmudict.dict line ${lineNumber}${problem}`)
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
 * @throws DictionaryFormatError when an item of an entry is not in `CMU_SYMBOLS`. The message names the word and the item.
 */
export function parseCmudict(text: string): Dictionary {
  const dictionary: Record<string, string> = {}
  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (line === '') return
    const [token = '', ...symbols] = line.split(/\s+/)
    const word = WORD.exec(token)?.[1]
    if (word === undefined || symbols.length === 0) {
      throw new DictionaryFormatError(index + 1, ` is not an entry: ${JSON.stringify(rawLine)}`)
    }
    // The phoneme breakdown maps each symbol later, so a bad symbol must stop the build and not reach the app.
    const bad = symbols.find((symbol) => findCmuSymbol(symbol) === undefined)
    if (bad !== undefined) {
      throw new DictionaryFormatError(
        index + 1,
        `: the word "${word}" has "${bad}", which is not a CMU symbol.`,
      )
    }
    const key = word.toUpperCase()
    if (!Object.hasOwn(dictionary, key)) dictionary[key] = symbols.join(' ')
  })
  return dictionary
}

/**
 * Returns the bytes of `public/dict/cmudict.json` for the text of `cmudict.dict`.
 * The same text always gives the same output, so the committed file can be checked.
 * @throws DictionaryFormatError when a line is not an entry or has an item that is not a CMU symbol.
 */
export function buildDictionaryJson(text: string): string {
  return `${JSON.stringify(parseCmudict(text))}\n`
}
