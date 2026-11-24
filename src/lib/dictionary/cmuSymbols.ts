/** One of the ten mouth shapes that the xLights Faces effect reads. The labels are case-sensitive. */
export type PhonemeLabel = 'AI' | 'E' | 'etc' | 'FV' | 'L' | 'MBP' | 'O' | 'rest' | 'U' | 'WQ'

/** One CMU symbol without its stress digit, and the phoneme label that it maps to. */
export interface CmuSymbol {
  /** The CMU symbol without a stress digit, for example `AY`. */
  readonly symbol: string
  /** The phoneme label of the symbol. */
  readonly label: PhonemeLabel
  /** True when the symbol is a vowel. Only a vowel carries a stress digit. */
  readonly vowel: boolean
}

// This data comes from the mapping table in docs/specs/features/03-phoneme-breakdown.md.
// It is not a copy of the xLights phoneme_mapping file, which has a GPL licence.
const VOWELS: readonly (readonly [string, PhonemeLabel])[] = [
  ['AA', 'AI'],
  ['AE', 'AI'],
  ['AH', 'AI'],
  ['AY', 'AI'],
  ['IH', 'AI'],
  ['EH', 'E'],
  ['ER', 'E'],
  ['EY', 'E'],
  ['IY', 'E'],
  ['AO', 'O'],
  ['AW', 'O'],
  ['OW', 'O'],
  ['UH', 'U'],
  ['UW', 'U'],
  ['OY', 'WQ'],
]

const CONSONANTS: readonly (readonly [string, PhonemeLabel])[] = [
  ['W', 'WQ'],
  ['L', 'L'],
  ['B', 'MBP'],
  ['M', 'MBP'],
  ['P', 'MBP'],
  ['F', 'FV'],
  ['V', 'FV'],
  ...[
    'CH',
    'D',
    'DH',
    'G',
    'HH',
    'JH',
    'K',
    'N',
    'NG',
    'R',
    'S',
    'SH',
    'T',
    'TH',
    'Y',
    'Z',
    'ZH',
  ].map((symbol) => [symbol, 'etc'] as const),
]

/**
 * The 39 CMU symbols of `cmudict.dict` with their phoneme labels, in the order of the mapping table.
 * The custom dictionary dialog shows this list as its reference table.
 */
export const CMU_SYMBOLS: readonly CmuSymbol[] = [
  ...VOWELS.map(([symbol, label]) => ({ symbol, label, vowel: true })),
  ...CONSONANTS.map(([symbol, label]) => ({ symbol, label, vowel: false })),
]

const BY_SYMBOL = new Map(CMU_SYMBOLS.map((entry) => [entry.symbol, entry]))

/**
 * Returns the entry of one CMU symbol, or `undefined` when the text is not a CMU symbol.
 * A vowel can carry one stress digit `0`, `1` or `2`, and the digit has no effect on the label.
 * A consonant with a digit and a symbol in lower case are not CMU symbols.
 * @param text One CMU symbol, for example `AY1` or `HH`.
 */
export function findCmuSymbol(text: string): CmuSymbol | undefined {
  const base = text.replace(/[0-2]$/, '')
  const entry = BY_SYMBOL.get(base)
  if (entry === undefined || (base !== text && !entry.vowel)) return undefined
  return entry
}
