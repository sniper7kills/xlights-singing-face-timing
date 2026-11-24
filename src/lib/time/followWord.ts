import { snap } from './snap.ts'
import type { TimeRange } from './timeRange.ts'

/**
 * Returns the phonemes of an edited word at the new time of the word, in time order.
 * TODO(#27): Call this function from the move and resize actions.
 *
 * The rules:
 * - If the word keeps its length, each phoneme moves by the same amount as the word.
 * - If the word changes length, each boundary scales in proportion and snaps to the frame size.
 * - After a scale, the first phoneme starts at the word start and the last phoneme ends at the word end.
 * - Each phoneme keeps one frame size or more when the new word has one frame for each phoneme.
 *
 * @param phonemes The phoneme marks of the word. Each one lies inside `from`.
 * @param from The word before the change. It is longer than 0.
 * @param to The word after the change. Its times are multiples of the frame size.
 * @param frameMs The frame size of the song.
 */
export function followWord<T extends TimeRange>(
  phonemes: readonly T[],
  from: TimeRange,
  to: TimeRange,
  frameMs: number,
): T[] {
  const ordered = [...phonemes].sort((a, b) => a.startMs - b.startMs)
  const shift = to.startMs - from.startMs
  if (to.endMs - to.startMs === from.endMs - from.startMs)
    return ordered.map((phoneme) => ({
      ...phoneme,
      startMs: phoneme.startMs + shift,
      endMs: phoneme.endMs + shift,
    }))
  const ratio = (to.endMs - to.startMs) / (from.endMs - from.startMs)
  let previous = to.startMs
  return ordered.map((phoneme, index) => {
    const later = ordered.length - 1 - index
    const ideal = snap(to.startMs + (phoneme.endMs - from.startMs) * ratio, frameMs)
    // The clamp keeps one frame size for this phoneme and for each later phoneme.
    const end = Math.min(Math.max(ideal, previous + frameMs), to.endMs - later * frameMs)
    const scaled = { ...phoneme, startMs: previous, endMs: later === 0 ? to.endMs : end }
    previous = scaled.endMs
    return scaled
  })
}
