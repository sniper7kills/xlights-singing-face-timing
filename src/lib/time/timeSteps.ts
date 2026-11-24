import type { TimeRange } from './timeRange.ts'

/**
 * Returns the time one frame size before or after `ms`: the next multiple of the frame size in that direction.
 * A time between two multiples goes to the nearer multiple in that direction, so the keys put the play cursor on a frame.
 * The result stays from 0 to the last multiple of the frame size in the song.
 * @param ms The time to start from, in milliseconds. It can be between two multiples.
 * @param direction 1 gives the later time, -1 the earlier time.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function stepTime(
  ms: number,
  direction: 1 | -1,
  frameMs: number,
  durationMs: number,
): number {
  const next =
    direction === 1
      ? Math.floor(ms / frameMs) * frameMs + frameMs
      : Math.ceil(ms / frameMs) * frameMs - frameMs
  const lastMs = Math.floor(durationMs / frameMs) * frameMs
  return Math.min(Math.max(next, 0), lastMs)
}

/**
 * Returns the time selection after the play cursor moves from `fromMs` to `toMs` with Shift held.
 * The fixed edge of the selection is the edge that is not at `fromMs`.
 * When no selection exists, or no edge is at `fromMs`, the fixed edge is `fromMs`, so a new selection starts at the play cursor.
 * Returns null when the result is empty, which is no time selection.
 * @param selection The current time selection, or null.
 * @param fromMs The play cursor before the key.
 * @param toMs The play cursor after the key.
 */
export function extendRange(
  selection: TimeRange | null,
  fromMs: number,
  toMs: number,
): TimeRange | null {
  let fixedMs = fromMs
  if (selection?.endMs === fromMs) fixedMs = selection.startMs
  else if (selection?.startMs === fromMs) fixedMs = selection.endMs
  const range = { startMs: Math.min(fixedMs, toMs), endMs: Math.max(fixedMs, toMs) }
  return range.endMs > range.startMs ? range : null
}
