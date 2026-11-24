import { snap } from '../time/snap.ts'
import type { PhonemeLabel } from './cmuSymbols.ts'
import { mergeEqualNeighbours } from './toPhonemeLabels.ts'

/** One phoneme of a word, with times in milliseconds that are multiples of the frame size. */
export interface SpreadPhoneme {
  readonly label: PhonemeLabel
  readonly startMs: number
  readonly endMs: number
}

// A sung vowel is longer than a consonant. The app writes no `rest` phoneme, so its weight has no effect.
const WEIGHTS: Readonly<Record<PhonemeLabel, number>> = {
  AI: 3,
  E: 3,
  O: 3,
  U: 3,
  WQ: 2,
  L: 2,
  MBP: 1,
  FV: 1,
  etc: 1,
  rest: 1,
}

/**
 * Returns the phonemes of one word, which fill the word with no gap and share it by weight.
 *
 * The rules:
 * - Each boundary is a multiple of the frame size, and each phoneme is one frame size or longer.
 * - If the word has fewer frames than phonemes, the app drops phonemes with the lowest weight first, from the end of the word.
 * - After a drop, adjacent equal labels merge into one phoneme.
 * - A word always keeps one phoneme or more. A word that snaps to less than one frame size gets one phoneme of one frame size.
 *
 * @param labels The merged phoneme labels of the word. An empty list gives no phonemes.
 * @param startMs The start time of the word.
 * @param endMs The end time of the word.
 * @param frameMs The frame size of the song.
 */
export function spread(
  labels: readonly PhonemeLabel[],
  startMs: number,
  endMs: number,
  frameMs: number,
): SpreadPhoneme[] {
  if (labels.length === 0) return []
  const start = snap(startMs, frameMs)
  const end = Math.max(snap(endMs, frameMs), start + frameMs)
  const frames = Math.round((end - start) / frameMs)
  let kept = [...labels]
  while (kept.length > frames) {
    const lowest = Math.min(...kept.map((label) => WEIGHTS[label]))
    kept.splice(
      kept.findLastIndex((label) => WEIGHTS[label] === lowest),
      1,
    )
    kept = mergeEqualNeighbours(kept)
  }
  const total = kept.reduce((sum, label) => sum + WEIGHTS[label], 0)
  const phonemes: SpreadPhoneme[] = []
  let weightSoFar = 0
  let previous = start
  for (const [index, label] of kept.entries()) {
    weightSoFar += WEIGHTS[label]
    const later = kept.length - 1 - index
    const ideal = snap(start + ((end - start) * weightSoFar) / total, frameMs)
    // The clamp keeps one frame size for this phoneme and for each later phoneme.
    const boundary = Math.min(Math.max(ideal, previous + frameMs), end - later * frameMs)
    phonemes.push({ label, startMs: previous, endMs: boundary })
    previous = boundary
  }
  return phonemes
}
