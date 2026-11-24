import { normaliseWord } from './normaliseWord.ts'
import type { Dictionary } from './types.ts'

/**
 * Returns the CMU symbols of a "sounds like" spelling, or the first part that no dictionary has.
 *
 * The rules:
 * - Spaces separate the parts. Spaces at the start and at the end have no effect.
 * - The app normalises each part, then looks it up in the custom dictionary first, then in the dictionary.
 * - The result joins the CMU symbols of the parts, in order, with one space.
 * - A spelling with no part gives `{ ok: false, unknown: '' }`.
 *
 * @param spelling The "sounds like" spelling, for example `ROO DOLF`.
 * @param customEntries The custom dictionary.
 * @param dictionary The dictionary from `public/dict/cmudict.json`.
 */
export function resolveSoundsLike(
  spelling: string,
  customEntries: Dictionary,
  dictionary: Dictionary,
): { ok: true; symbols: string } | { ok: false; unknown: string } {
  const parts = spelling.trim() === '' ? [] : spelling.trim().split(/\s+/)
  if (parts.length === 0) return { ok: false, unknown: '' }
  const symbols: string[] = []
  for (const part of parts) {
    const key = normaliseWord(part)
    // Object.hasOwn keeps a key such as `CONSTRUCTOR` away from Object.prototype.
    const found = [customEntries, dictionary]
      .map((table) => (Object.hasOwn(table, key) ? table[key] : undefined))
      .find((entry) => entry !== undefined)
    // A part with only punctuation has an empty key, so the message names the part as typed.
    if (key === '' || found === undefined) return { ok: false, unknown: key === '' ? part : key }
    symbols.push(found)
  }
  return { ok: true, symbols: symbols.join(' ') }
}
