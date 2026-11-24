import { findCmuSymbol, type PhonemeLabel } from './cmuSymbols.ts'

/**
 * Returns the phoneme labels of one word: each CMU symbol mapped, then adjacent equal labels merged.
 * @param symbols The CMU symbols of the word, with or without stress digits on the vowels.
 * @throws Error when an item is not a CMU symbol. The message names the item.
 */
export function toPhonemeLabels(symbols: readonly string[]): PhonemeLabel[] {
  return mergeEqualNeighbours(
    symbols.map((symbol) => {
      const entry = findCmuSymbol(symbol)
      if (entry === undefined) throw new Error(`${symbol} is not a CMU symbol.`)
      return entry.label
    }),
  )
}

/**
 * Returns the labels with each run of adjacent equal labels replaced by one label.
 * The Faces effect shows two adjacent equal phonemes as one mouth shape, so the app writes one.
 * @param labels The phoneme labels of one word.
 */
export function mergeEqualNeighbours(labels: readonly PhonemeLabel[]): PhonemeLabel[] {
  return labels.filter((label, index) => index === 0 || labels[index - 1] !== label)
}
