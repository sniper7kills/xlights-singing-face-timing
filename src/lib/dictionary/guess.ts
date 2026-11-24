// Each symbol gives the phoneme label that the rule in the feature file names for the letter.
const VOWEL_SYMBOLS: Readonly<Record<string, string>> = {
  A: 'AH',
  I: 'AH',
  E: 'EH',
  O: 'OW',
  U: 'UW',
}

const CONSONANT_SYMBOLS: Readonly<Record<string, readonly string[]>> = {
  B: ['B'],
  C: ['K'],
  D: ['D'],
  F: ['F'],
  G: ['G'],
  H: ['HH'],
  J: ['JH'],
  K: ['K'],
  L: ['L'],
  M: ['M'],
  N: ['N'],
  P: ['P'],
  Q: ['W'],
  R: ['R'],
  S: ['S'],
  T: ['T'],
  V: ['V'],
  W: ['W'],
  X: ['K', 'S'],
  Y: ['Y'],
  Z: ['Z'],
}

/**
 * Returns CMU symbols that the app guesses from the spelling of a word that no dictionary has.
 *
 * The rules:
 * - Each group of adjacent vowel letters gives one vowel symbol. The first letter of the group decides it, so `EA` gives the `E` label.
 * - `A` and `I` give the `AI` label, `E` gives `E`, `O` gives `O` and `U` gives `U`.
 * - Each consonant letter gives a symbol of its family in the mapping table. `Y` is a consonant.
 * - A word with no letters, for example `12` or an empty key, gives one `HH` symbol, which maps to `etc`.
 *
 * @param word The normalised word, in upper case.
 */
export function guess(word: string): string[] {
  const symbols: string[] = []
  let previousVowel = false
  for (const letter of word) {
    const vowel = VOWEL_SYMBOLS[letter]
    if (vowel !== undefined) {
      if (!previousVowel) symbols.push(vowel)
      previousVowel = true
    } else {
      symbols.push(...(CONSONANT_SYMBOLS[letter] ?? []))
      previousVowel = false
    }
  }
  return symbols.length > 0 ? symbols : ['HH']
}
