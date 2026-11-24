import type { Mark } from '../../store/types.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { childrenOf, findMark } from './family.ts'

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
 * Returns the ids that name a mark of the song, in the same order.
 * The selection keeps only these ids after a change of the marks.
 * @param marks The marks of the song.
 * @param ids The ids to check, usually the selected marks.
 */
export function existingIds(marks: readonly Mark[], ids: readonly string[]): string[] {
  const known = new Set(marks.map((mark) => mark.id))
  return ids.filter((id) => known.has(id))
}

/**
 * Returns the mark that `Up` or `Down` selects from the mark: the parent for `up`, and the first child in time for `down`.
 * Returns undefined when that mark does not exist: `up` from a phrase, `down` from a phoneme, or `down` from a mark with no children.
 * @param marks The marks of the song.
 * @param mark The selected mark.
 * @param direction `up` goes to the layer above, `down` to the layer below.
 */
export function markOnNextLayer(
  marks: readonly Mark[],
  mark: Mark,
  direction: 'up' | 'down',
): Mark | undefined {
  if (direction === 'down') return childrenOf(marks, mark.id)[0]
  return mark.parentId === null ? undefined : findMark(marks, mark.parentId)
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
