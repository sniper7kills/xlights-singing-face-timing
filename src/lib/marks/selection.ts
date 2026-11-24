import type { Mark } from '../../store/types.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { findMark } from './family.ts'

/** The length of a mark that a double-click adds, in frames. The add rule clamps it to the empty range. */
const ADD_LENGTH_FRAMES = 10

/**
 * Returns the ids of the marks from the anchor mark to the target mark on one layer of one voice, in time order.
 * Both marks are in the result.
 * Returns only the target id in these cases:
 * - No mark has the anchor id.
 * - The anchor mark is on a different layer or of a different voice.
 * Returns an empty list when no mark has the target id.
 * @param marks The marks of the song.
 * @param anchorId The id of the mark that the person selected before.
 * @param targetId The id of the mark that the person selects now.
 */
export function marksBetween(marks: readonly Mark[], anchorId: string, targetId: string): string[] {
  const target = findMark(marks, targetId)
  if (!target) return []
  const anchor = findMark(marks, anchorId)
  if (!anchor || anchor.layer !== target.layer || anchor.voiceId !== target.voiceId)
    return [target.id]
  const startMs = Math.min(anchor.startMs, target.startMs)
  const endMs = Math.max(anchor.endMs, target.endMs)
  return marks
    .filter(
      (mark) =>
        mark.voiceId === target.voiceId &&
        mark.layer === target.layer &&
        mark.startMs >= startMs &&
        mark.endMs <= endMs,
    )
    .sort((a, b) => a.startMs - b.startMs)
    .map((mark) => mark.id)
}

/**
 * Returns the range that a double-click at `atMs` asks `addMark` for: 10 frames from `atMs`.
 * The add rule snaps the range and clamps it to the empty range around `atMs`.
 * @param atMs The time under the pointer.
 * @param frameMs The frame size of the song.
 */
export function addRangeAt(atMs: number, frameMs: number): TimeRange {
  return { startMs: atMs, endMs: atMs + ADD_LENGTH_FRAMES * frameMs }
}
