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
