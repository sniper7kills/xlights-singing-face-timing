/**
 * Returns the form of a word that the align step compares: lower case, with only
 * letters and digits.
 * This form is for comparison only. Mark labels keep the original text.
 * @param text The word as the speech model or the lyrics spell it.
 * @returns An empty string when the word has no letter and no digit.
 */
export function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Returns true when a part of a lyrics line or a word of the speech model gives a word mark: it has a letter or a digit.
 * The lyrics question, the lyrics parser and the label rule of the marks all use this rule, so their counts agree.
 * A lone `&`, an emoji or a dash gives no word.
 * @param text One part of the text between spaces.
 */
export function isLyricsWord(text: string): boolean {
  return normaliseForMatch(text) !== ''
}
