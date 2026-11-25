import type { Mark } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { childrenOf, findMark, nextOnLayer, previousOnLayer } from './family.ts'

/** The legal values of one time, from `minMs` to `maxMs`. Both are multiples of the frame size. */
export type Limits = { minMs: number; maxMs: number }

/** The legal amounts of one move, from `minDeltaMs` (0 or less) to `maxDeltaMs` (0 or more). */
export type MoveLimits = { minDeltaMs: number; maxDeltaMs: number }

/** A mark shorter than this count of frames is short: it is hard to see and to grab, so the editor marks it. */
export const SHORT_FRAMES = 3

/**
 * Returns true when the range is shorter than `SHORT_FRAMES` frames.
 * @param range The times of the mark.
 * @param frameMs The frame size of the song.
 */
export function isShortMark(range: TimeRange, frameMs: number): boolean {
  return range.endMs - range.startMs < SHORT_FRAMES * frameMs
}

/** Returns the value, moved into the range from `min` to `max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Returns the range that the mark must stay inside: its parent mark, or the song for a phrase.
 * The song range ends at the last multiple of the frame size in the song, so each time stays a multiple.
 */
function outerRange(
  marks: readonly Mark[],
  mark: Mark,
  frameMs: number,
  durationMs: number,
): TimeRange {
  const parent = mark.parentId === null ? undefined : findMark(marks, mark.parentId)
  return parent ?? { startMs: 0, endMs: Math.floor(durationMs / frameMs) * frameMs }
}

/**
 * Returns the shortest legal length of the mark.
 * An edited word keeps its phonemes, which `followWord` scales, so it needs one frame size for each phoneme.
 */
function shortestLength(marks: readonly Mark[], mark: Mark, frameMs: number): number {
  if (mark.layer !== 'word' || !mark.edited) return frameMs
  return Math.max(1, childrenOf(marks, mark.id).length) * frameMs
}

/** Returns the latest legal start of the mark while its end stays. A phrase start stops at its first word. */
function latestStart(marks: readonly Mark[], mark: Mark, frameMs: number): number {
  const first = mark.layer === 'phrase' ? childrenOf(marks, mark.id)[0] : undefined
  return first ? first.startMs : mark.endMs - shortestLength(marks, mark, frameMs)
}

/** Returns the earliest legal end of the mark while its start stays. A phrase end stops at its last word. */
function earliestEnd(marks: readonly Mark[], mark: Mark, frameMs: number): number {
  const last = mark.layer === 'phrase' ? childrenOf(marks, mark.id).at(-1) : undefined
  return last ? last.endMs : mark.startMs + shortestLength(marks, mark, frameMs)
}

// The current time is always legal, so a mark that already breaks a rule never gets worse.
function widen(min: number, max: number, current: number): Limits {
  return { minMs: Math.min(min, current), maxMs: Math.max(max, current) }
}

function startLimits(
  marks: readonly Mark[],
  mark: Mark,
  outer: TimeRange,
  frameMs: number,
): Limits {
  const previous = previousOnLayer(marks, mark)
  // The start can push the shared boundary back until the previous mark has its shortest length.
  const min = previous
    ? Math.max(outer.startMs, earliestEnd(marks, previous, frameMs))
    : outer.startMs
  return widen(min, latestStart(marks, mark, frameMs), mark.startMs)
}

function endLimits(marks: readonly Mark[], mark: Mark, outer: TimeRange, frameMs: number): Limits {
  const next = nextOnLayer(marks, mark)
  // The end can push the shared boundary on until the next mark has its shortest length.
  const max = next ? Math.min(outer.endMs, latestStart(marks, next, frameMs)) : outer.endMs
  return widen(earliestEnd(marks, mark, frameMs), max, mark.endMs)
}

/**
 * Returns the legal times of one edge of the mark during a resize.
 *
 * The rules:
 * - The edge stays inside the parent mark. A phrase edge stays inside the song.
 * - The mark stays one frame size or longer. An edited word keeps one frame size for each phoneme.
 * - A phrase edge stops at its first or last word.
 * - The edge can push the shared boundary of the adjacent mark until that mark has its shortest length.
 *
 * @param marks The marks of the song.
 * @param mark The mark to resize.
 * @param edge The edge to move.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function edgeLimits(
  marks: readonly Mark[],
  mark: Mark,
  edge: 'start' | 'end',
  frameMs: number,
  durationMs: number,
): Limits {
  const outer = outerRange(marks, mark, frameMs, durationMs)
  return edge === 'start'
    ? startLimits(marks, mark, outer, frameMs)
    : endLimits(marks, mark, outer, frameMs)
}

/**
 * Returns the legal amounts of a move of the mark. The mark keeps its length.
 * The mark stops at the adjacent mark on its layer and at the parent edge. A phrase stops at 0 and at the end of the song.
 * @param marks The marks of the song.
 * @param mark The mark to move.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function moveLimits(
  marks: readonly Mark[],
  mark: Mark,
  frameMs: number,
  durationMs: number,
): MoveLimits {
  const outer = outerRange(marks, mark, frameMs, durationMs)
  const earliest = Math.max(outer.startMs, previousOnLayer(marks, mark)?.endMs ?? outer.startMs)
  const latest = Math.min(outer.endMs, nextOnLayer(marks, mark)?.startMs ?? outer.endMs)
  return {
    minDeltaMs: Math.min(earliest - mark.startMs, 0),
    maxDeltaMs: Math.max(latest - mark.endMs, 0),
  }
}

/**
 * The rule that changes a typed edge time:
 * - `snap`: the time moves to a multiple of the frame size.
 * - `parent`: the edge stops at the edge of the parent mark.
 * - `song`: a phrase edge stops at the last multiple of the frame size in the song.
 * - `adjacent`: the edge stops where the adjacent mark has its shortest length.
 * - `shortest`: the edge stops where the mark has its shortest length.
 * - `words`: a phrase edge stops at its first or last word.
 */
export type LimitCause = 'snap' | 'parent' | 'song' | 'adjacent' | 'shortest' | 'words'

function outerCause(mark: Mark): LimitCause {
  return mark.parentId === null ? 'song' : 'parent'
}

/** Returns the cause of the limit that keeps the mark from getting shorter. */
function ownCause(marks: readonly Mark[], mark: Mark): LimitCause {
  return mark.layer === 'phrase' && childrenOf(marks, mark.id).length > 0 ? 'words' : 'shortest'
}

function earlyCause(marks: readonly Mark[], mark: Mark, outer: TimeRange, frameMs: number) {
  const previous = previousOnLayer(marks, mark)
  return previous && earliestEnd(marks, previous, frameMs) > outer.startMs
    ? 'adjacent'
    : outerCause(mark)
}

function lateCause(marks: readonly Mark[], mark: Mark, outer: TimeRange, frameMs: number) {
  const next = nextOnLayer(marks, mark)
  return next && latestStart(marks, next, frameMs) < outer.endMs ? 'adjacent' : outerCause(mark)
}

/**
 * Returns the rule that changes a typed time of an edge, or null when the resize uses the time as typed.
 * The limits are those of `edgeLimits`, so the result agrees with `previewResize`.
 * @param marks The marks of the song.
 * @param mark The mark to resize.
 * @param edge The edge to move.
 * @param toMs The typed time of the edge.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function resizeCause(
  marks: readonly Mark[],
  mark: Mark,
  edge: 'start' | 'end',
  toMs: number,
  frameMs: number,
  durationMs: number,
): LimitCause | null {
  const snapped = snap(toMs, frameMs)
  const { minMs, maxMs } = edgeLimits(marks, mark, edge, frameMs, durationMs)
  const outer = outerRange(marks, mark, frameMs, durationMs)
  if (snapped < minMs)
    return edge === 'start' ? earlyCause(marks, mark, outer, frameMs) : ownCause(marks, mark)
  if (snapped > maxMs)
    return edge === 'end' ? lateCause(marks, mark, outer, frameMs) : ownCause(marks, mark)
  return snapped === toMs ? null : 'snap'
}
