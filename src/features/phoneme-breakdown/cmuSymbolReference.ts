import { CMU_SYMBOLS, type CmuSymbol } from '../../lib/dictionary/cmuSymbols.ts'

/** One row of the reference table: a CMU symbol, its phoneme label and an example word. */
export interface CmuSymbolExample extends CmuSymbol {
  /** A word with the sound of the symbol, for example `hide` for `AY`. */
  readonly example: string
}

const EXAMPLE_WORDS: Readonly<Record<string, string>> = {
  AA: 'odd',
  AE: 'at',
  AH: 'hut',
  AO: 'ought',
  AW: 'cow',
  AY: 'hide',
  B: 'be',
  CH: 'cheese',
  D: 'dee',
  DH: 'thee',
  EH: 'Ed',
  ER: 'hurt',
  EY: 'ate',
  F: 'fee',
  G: 'green',
  HH: 'he',
  IH: 'it',
  IY: 'eat',
  JH: 'gee',
  K: 'key',
  L: 'lee',
  M: 'me',
  N: 'knee',
  NG: 'ping',
  OW: 'oat',
  OY: 'toy',
  P: 'pee',
  R: 'read',
  S: 'sea',
  SH: 'she',
  T: 'tea',
  TH: 'theta',
  UH: 'hood',
  UW: 'two',
  V: 'vee',
  W: 'we',
  Y: 'yield',
  Z: 'zee',
  ZH: 'seizure',
}

/** The rows of the reference table in the custom dictionary dialog, in the order of the mapping table. */
export const CMU_SYMBOL_REFERENCE: readonly CmuSymbolExample[] = CMU_SYMBOLS.map((entry) => ({
  ...entry,
  example: EXAMPLE_WORDS[entry.symbol] ?? '',
}))
