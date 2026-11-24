import type { PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'

/**
 * The SVG path of the mouth for each phoneme label, in the 120 × 120 box of the face preview.
 * The `Record` type makes the compiler require a shape for each label of `PHONEME_LABELS`.
 * `rest` is the closed mouth. The face preview also shows it when no phoneme is at the play time.
 * The paths come from the editor mockup, `docs/specs/mockups/02-editor.html`.
 */
export const MOUTH_SHAPES: Readonly<Record<PhonemeLabel, string>> = {
  AI: 'M40 76 Q60 70 80 76 Q60 104 40 76',
  E: 'M38 78 Q60 74 82 78 Q60 94 38 78',
  etc: 'M42 79 Q60 76 78 79 Q60 90 42 79',
  FV: 'M42 80 Q60 76 78 80 Q60 88 42 80',
  L: 'M42 76 Q60 72 78 76 Q60 96 42 76',
  MBP: 'M42 82 Q60 80 78 82 Q60 84 42 82',
  O: 'M50 74 Q60 68 70 74 Q74 86 60 96 Q46 86 50 74',
  rest: 'M40 82 Q60 86 80 82',
  U: 'M53 78 Q60 73 67 78 Q69 86 60 91 Q51 86 53 78',
  WQ: 'M52 80 Q60 76 68 80 Q60 88 52 80',
}
