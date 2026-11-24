import { guess } from './guess.ts'
import { normaliseWord } from './normaliseWord.ts'
import type { Dictionary } from './types.ts'

/** The CMU symbols of a word and the table that gave them. */
export interface LookupResult {
  /** The CMU symbols, with the stress digits that the entry holds. */
  readonly symbols: string[]
  /** `custom` and `cmu` name the dictionary. `guess` means that the word is unknown. */
  readonly source: 'custom' | 'cmu' | 'guess'
}

/**
 * Returns the CMU symbols of a word label from the custom dictionary, else the dictionary, else the rule-based guess.
 *
 * The rules:
 * - The app normalises the label first, so `Hello!` looks up `HELLO`.
 * - A key that ends in `IN'` also looks up the same key with `ING`, so `singin'` looks up `SINGIN'`, then `SINGING`.
 * - The custom dictionary has priority for both keys: a custom `SINGING` comes before a `SINGIN'` in the dictionary.
 * - A key of digits only, or an empty key, is unknown.
 *
 * @param word The word label.
 * @param customEntries The custom dictionary, with the same shape as the dictionary.
 * @param dictionary The dictionary from `public/dict/cmudict.json`.
 */
export function lookup(
  word: string,
  customEntries: Dictionary,
  dictionary: Dictionary,
): LookupResult {
  const key = normaliseWord(word)
  if (!/^[0-9]*$/.test(key)) {
    const keys = key.endsWith("IN'") ? [key, `${key.slice(0, -1)}G`] : [key]
    for (const [source, table] of [
      ['custom', customEntries],
      ['cmu', dictionary],
    ] as const) {
      // Object.hasOwn keeps a key such as `CONSTRUCTOR` away from Object.prototype.
      const found = keys
        .map((candidate) => (Object.hasOwn(table, candidate) ? table[candidate] : undefined))
        .find((symbols) => symbols !== undefined)
      if (found !== undefined) return { symbols: found.split(' '), source }
    }
  }
  return { symbols: guess(key), source: 'guess' }
}
