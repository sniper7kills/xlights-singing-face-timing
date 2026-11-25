import type { TimeRange } from '../time/timeRange.ts'
import { SHORT_FRAMES } from './limits.ts'

/** A time range in frames. The layout works in whole frames, so every time stays a multiple of the frame size. */
type Slot = { start: number; end: number }

/** Returns `count` slots that share the frames from `start` to `end` evenly. Each slot gets one frame or more. */
function equalShare(count: number, start: number, end: number): Slot[] {
  const room = end - start
  return Array.from({ length: count }, (_, i) => ({
    start: start + Math.floor((i * room) / count),
    end: start + Math.floor(((i + 1) * room) / count),
  }))
}

/** The free frames of one run of new words, between the matched word before it and the matched word after it. */
type Run = { from: number; to: number; before: Slot | undefined; after: Slot | undefined }

/**
 * Takes frames from the matched word before the run, then from the matched word after it, until the run has `target` frames.
 * A matched word keeps `floor` frames or more.
 */
function widen(run: Run, target: number, floor: number): void {
  const { before, after } = run
  const needBefore = target - (run.to - run.from)
  if (before && needBefore > 0) {
    const give = Math.min(needBefore, Math.max(0, before.end - before.start - floor))
    before.end -= give
    run.from -= give
  }
  const needAfter = target - (run.to - run.from)
  if (after && needAfter > 0) {
    const give = Math.min(needAfter, Math.max(0, after.end - after.start - floor))
    after.start += give
    run.to += give
  }
}

/**
 * Places the run of new words from index `first` to `last` (exclusive) of `slots`.
 * Returns false when the run cannot get one frame for each word.
 */
function placeRun(slots: (Slot | undefined)[], first: number, last: number, phrase: Slot): boolean {
  const before = slots[first - 1]
  const after = slots[last]
  const run: Run = {
    from: before?.end ?? phrase.start,
    to: after?.start ?? phrase.end,
    before,
    after,
  }
  const count = last - first
  widen(run, SHORT_FRAMES * count, SHORT_FRAMES)
  widen(run, count, 1)
  if (run.to - run.from < count) return false
  equalShare(count, run.from, run.to).forEach((slot, i) => (slots[first + i] = slot))
  return true
}

/** Returns the index after the run of new words that starts at `first`. */
function runEnd(slots: readonly (Slot | undefined)[], first: number): number {
  let last = first
  while (last < slots.length && slots[last] === undefined) last += 1
  return last
}

/** Places every run of new words. Returns false when one run cannot get one frame for each word. */
function placeRuns(slots: (Slot | undefined)[], phrase: Slot): boolean {
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i] !== undefined) continue
    const last = runEnd(slots, i)
    if (!placeRun(slots, i, last, phrase)) return false
    i = last
  }
  return true
}

/**
 * Returns the times of the words of a phrase after a change of the phrase label.
 *
 * The rules:
 * - A matched word keeps its time.
 * - A run of new words between two matched words shares the free time between them evenly.
 * - A run with less than 3 frames for each word takes time from the matched word before it, which ends earlier.
 *   Then it takes time from the matched word after it, which starts later. Each of these words keeps 3 frames or more.
 * - A run that still has less than 1 frame for each word takes time from the same words down to 1 frame.
 * - When the phrase has less than 3 frames for each word, or a run cannot get 1 frame for each word,
 *   every word of the phrase gets an equal share of the phrase, with 1 frame or more.
 * - When the phrase has fewer frames than words, only the first words get a time, and the result is shorter.
 *
 * @param matched For each word in label order, the time of the old word that it matches, or undefined for a new word.
 * @param phrase The range of the phrase. Its times and the matched times are multiples of `frameMs`.
 * @param frameMs The frame size of the song.
 */
export function layoutPhraseWords(
  matched: readonly (TimeRange | undefined)[],
  phrase: TimeRange,
  frameMs: number,
): TimeRange[] {
  const span = {
    start: Math.round(phrase.startMs / frameMs),
    end: Math.round(phrase.endMs / frameMs),
  }
  const room = span.end - span.start
  const toMs = (slot: Slot): TimeRange => ({
    startMs: slot.start * frameMs,
    endMs: slot.end * frameMs,
  })
  const shared = () => equalShare(Math.min(matched.length, room), span.start, span.end).map(toMs)
  if (room < SHORT_FRAMES * matched.length) return shared()
  const slots = matched.map(
    (range) =>
      range && {
        start: Math.round(range.startMs / frameMs),
        end: Math.round(range.endMs / frameMs),
      },
  )
  if (!placeRuns(slots, span)) return shared()
  return slots.map((slot) => toMs(slot ?? span))
}
