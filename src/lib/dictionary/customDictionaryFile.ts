import { normaliseWord } from './normaliseWord.ts'
import { validateSymbols } from './validateSymbols.ts'

/** One custom entry in the custom dictionary file. */
export interface CustomDictionaryLine {
  /** The word as a dictionary key: upper case, 1 to 40 characters, with no spaces. */
  readonly word: string
  /** The CMU symbols in upper case, separated by one space. */
  readonly symbols: string
}

/** One bad line of a custom dictionary file and the cause that the import report shows. */
export interface SkippedLine {
  /** The line number. The first line of the file is line 1. */
  readonly line: number
  /** The cause, as a sentence that follows "Line <number>: ", for example `no symbols.` */
  readonly reason: string
}

/** The result of a parse: one entry for each word, in file order, and the bad lines in file order. */
export interface ParsedCustomDictionary {
  readonly entries: CustomDictionaryLine[]
  readonly skipped: SkippedLine[]
}

/** The longest word that a custom entry can have. */
export const MAX_WORD_LENGTH = 40

const COMMENT = ';;;'
// The word, two spaces, then the CMU symbols separated by one space.
const ENTRY_LINE = /^(\S+) {2}(\S+(?: \S+)*)$/

/**
 * Returns true when a text is a good custom entry word: 1 to 40 characters with no spaces.
 * @param word The word in upper case.
 */
export function isEntryWord(word: string): boolean {
  return word.length >= 1 && word.length <= MAX_WORD_LENGTH && !/\s/.test(word)
}

/**
 * Returns true when a dictionary key has a letter or a digit.
 * A key of apostrophes only, for example `'`, has neither.
 * @param key The word after `normaliseWord`.
 */
export function hasLetterOrDigit(key: string): boolean {
  return /[A-Z0-9]/.test(key)
}

/**
 * Returns the dictionary key of a custom entry word, or undefined when the word cannot be an entry.
 * The key cannot be empty, apostrophes only, or digits only.
 * `lookup` never finds an empty key or a key of digits only, so an entry with such a key does nothing.
 * @param word The word as the person or a file wrote it.
 */
export function entryKey(word: string): string | undefined {
  const key = normaliseWord(word)
  return !hasLetterOrDigit(key) || /^[0-9]+$/.test(key) ? undefined : key
}

/**
 * Returns the custom entries of a custom dictionary file and the lines that it skips, each with its cause.
 *
 * The rules:
 * - One entry for each line: the word, two spaces, then the CMU symbols separated by one space.
 * - A line that starts with `;;;` is a comment. An empty line has no entry. Neither one is a bad line.
 * - The parse changes lower case to upper case, so `rudolph  r uw1` gives `RUDOLPH  R UW1`.
 * - The parse normalises the word, so `RUDOLPH!` gives `RUDOLPH`.
 * - A bad line has one of these causes, in this order of check:
 *   - The line has a word and no symbols: `no symbols.`
 *   - The line has other spaces: `use two spaces after the word and one space between the symbols.`
 *   - The normalised word has no letter, for example `123` or `'`: `the word has no letter.`
 *   - The normalised word has more than 40 characters: `the word has more than 40 characters.`
 *   - An item is not a CMU symbol: `“ZZ” is not a symbol.`
 * - If two lines give the same word, the later line wins and the file has one entry for the word.
 *
 * @param text The text of the file. Lines end with LF or CR LF.
 */
export function parseCustomDictionary(text: string): ParsedCustomDictionary {
  const symbolsByWord = new Map<string, string>()
  const skipped: SkippedLine[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '' || line.startsWith(COMMENT)) return
    const result = parseLine(line)
    if ('reason' in result) skipped.push({ line: index + 1, reason: result.reason })
    else symbolsByWord.set(result.word, result.symbols)
  })
  const entries = Array.from(symbolsByWord, ([word, symbols]) => ({ word, symbols }))
  return { entries, skipped }
}

/** Returns the entry of one line that is not empty and not a comment, or the cause that the line is bad. */
function parseLine(line: string): CustomDictionaryLine | { reason: string } {
  const upper = line.toUpperCase()
  const match = ENTRY_LINE.exec(upper)
  if (match?.[1] === undefined || match[2] === undefined) {
    return {
      reason: /^\s*\S+\s*$/.test(upper)
        ? 'no symbols.'
        : 'use two spaces after the word and one space between the symbols.',
    }
  }
  const word = entryKey(match[1])
  if (word === undefined) return { reason: 'the word has no letter.' }
  if (word.length > MAX_WORD_LENGTH) return { reason: 'the word has more than 40 characters.' }
  const symbols = match[2]
  const valid = validateSymbols(symbols)
  return valid.ok ? { word, symbols } : { reason: `“${valid.bad}” is not a symbol.` }
}

/**
 * Returns the text of a custom dictionary file: one comment line, then one line for each entry.
 * `parseCustomDictionary` of the text gives the same entries.
 * @param entries The custom entries, in the order of the file.
 */
export function writeCustomDictionary(entries: readonly CustomDictionaryLine[]): string {
  const lines = [
    `${COMMENT} Custom dictionary of Singing Face Timing: the word, two spaces, then the CMU symbols.`,
    ...entries.map(({ word, symbols }) => `${word}  ${symbols}`),
  ]
  return `${lines.join('\n')}\n`
}
