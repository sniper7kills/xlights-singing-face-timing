import { findCmuSymbol } from './cmuSymbols.ts'

/**
 * Returns `{ ok: true }` when a text holds one or more CMU symbols and nothing else, else names the first bad item.
 *
 * The rules:
 * - Spaces separate the symbols. Spaces at the start and at the end have no effect.
 * - A symbol is in upper case. A vowel can have one stress digit `0`, `1` or `2`. A consonant has no digit.
 * - A text with no symbols gives `{ ok: false, bad: '' }`, because an entry needs one symbol or more.
 *
 * @param text The CMU symbols that the person typed, for example `R UW1 D AA0 L F`.
 */
export function validateSymbols(text: string): { ok: true } | { ok: false; bad: string } {
  const items = text.trim().split(/\s+/)
  const bad = items.find((item) => findCmuSymbol(item) === undefined)
  return bad === undefined ? { ok: true } : { ok: false, bad }
}
