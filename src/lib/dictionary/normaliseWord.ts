/**
 * Returns the dictionary key of a word label: upper case, with only the letters `A` to `Z`, digits and apostrophes.
 * The dictionary holds only the letters `A` to `Z`, so the app also removes letters with accents.
 * A label with only punctuation, for example `-`, gives an empty key.
 * @param label The word label as the person or the speech model wrote it.
 */
export function normaliseWord(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9']/g, '')
}
