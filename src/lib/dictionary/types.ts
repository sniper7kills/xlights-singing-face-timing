/**
 * The table that gives the CMU symbols for a word.
 * The key is the word in upper case, for example `HELLO`.
 * The value is its CMU symbols separated by one space, for example `HH AH0 L OW1`.
 * `public/dict/cmudict.json` has this shape.
 */
export type Dictionary = Readonly<Record<string, string>>
