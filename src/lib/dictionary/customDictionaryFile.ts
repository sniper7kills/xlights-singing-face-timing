import { validateSymbols } from './validateSymbols.ts'

/** One custom entry in the custom dictionary file. */
export interface CustomDictionaryLine {
  /** The word in upper case, 1 to 40 characters, with no spaces. */
  readonly word: string
  /** The CMU symbols in upper case, separated by one space. */
  readonly symbols: string
}

/** The result of a parse: the good entries, in file order, and the numbers of the bad lines. */
export interface ParsedCustomDictionary {
  readonly entries: CustomDictionaryLine[]
  /** The line numbers of the bad lines. The first line of the file is line 1. */
  readonly skippedLines: number[]
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
 * Returns the custom entries of a custom dictionary file and the numbers of the lines that it skips.
 *
 * The rules:
 * - One entry for each line: the word, two spaces, then the CMU symbols separated by one space.
 * - A line that starts with `;;;` is a comment. An empty line has no entry. Neither one is a bad line.
 * - The parse changes lower case to upper case, so `rudolph  r uw1` gives `RUDOLPH  R UW1`.
 * - A line with a bad word, a bad CMU symbol or other spaces is a bad line.
 *
 * @param text The text of the file. Lines end with LF or CR LF.
 */
export function parseCustomDictionary(text: string): ParsedCustomDictionary {
  const entries: CustomDictionaryLine[] = []
  const skippedLines: number[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '' || line.startsWith(COMMENT)) return
    const match = ENTRY_LINE.exec(line.toUpperCase())
    const word = match?.[1]
    const symbols = match?.[2]
    if (
      word === undefined ||
      symbols === undefined ||
      !isEntryWord(word) ||
      !validateSymbols(symbols).ok
    ) {
      skippedLines.push(index + 1)
      return
    }
    entries.push({ word, symbols })
  })
  return { entries, skippedLines }
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
