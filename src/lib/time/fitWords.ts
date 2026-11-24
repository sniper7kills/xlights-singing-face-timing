import { snap } from './snap.ts'
import type { TimeRange } from './timeRange.ts'

/**
 * Returns the words with times that are multiples of the frame size, one frame size long or more, with no overlap.
 * Every time lies from the first frame multiple at or after `range.startMs` to the last frame multiple at or before `range.endMs`.
 * A word that overlaps the next word ends where the next word starts.
 * A word that is shorter than one frame size grows to one frame size, and the next word starts after it.
 * A word that ends after the range moves back into the range, and it moves the words before it when they overlap.
 * If the range is too short for one frame size for each word, the function keeps only the earliest words that fit.
 * @param words The words in time order.
 * @param frameMs The frame size of the song.
 * @param range The target range of the run. For a full-song run, the range is the full song.
 */
export function fitWords<T extends TimeRange>(
  words: readonly T[],
  frameMs: number,
  range: TimeRange,
): T[] {
  // A mark that crosses an edge of the range survives the replace step of the next run, and the next run then adds it again.
  const firstMs = Math.ceil(range.startMs / frameMs) * frameMs
  const lastMs = Math.floor(range.endMs / frameMs) * frameMs
  const kept = words.slice(0, Math.max(0, Math.round((lastMs - firstMs) / frameMs)))

  const fitted: T[] = []
  let previousEndMs = firstMs
  kept.forEach((word, i) => {
    const next = kept[i + 1]
    const startMs = Math.max(snap(word.startMs, frameMs), previousEndMs)
    const nextStartMs = next === undefined ? lastMs : snap(next.startMs, frameMs)
    const endMs = Math.max(Math.min(snap(word.endMs, frameMs), nextStartMs), startMs + frameMs)
    fitted.push({ ...word, startMs, endMs })
    previousEndMs = endMs
  })

  let limitMs = lastMs
  for (const word of fitted.toReversed()) {
    word.endMs = Math.min(word.endMs, limitMs)
    word.startMs = Math.min(word.startMs, word.endMs - frameMs)
    limitMs = word.startMs
  }
  return fitted
}
