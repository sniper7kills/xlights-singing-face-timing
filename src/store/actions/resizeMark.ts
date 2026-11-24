import { findMark } from '../../lib/marks/family.ts'
import { edgeLimits } from '../../lib/marks/limits.ts'
import { previewResize } from '../../lib/marks/moveRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Moves one edge of a mark of the open song to `toMs`, as one undo step. The rules are those of `previewResize`.
 * A time past a limit moves the edge to the limit. A call that changes nothing records no step.
 * Each unedited word that changes length gets a new break down in the same step. See `commitMarkEdit`.
 * @param id The id of the mark. An unknown id changes nothing.
 * @param edge The edge to move.
 * @param toMs The new time of the edge, in milliseconds.
 */
export function resizeMark(id: string, edge: 'start' | 'end', toMs: number): void {
  useSongStore
    .getState()
    .apply((content) =>
      commitMarkEdit(
        content,
        previewResize(content.marks, id, edge, toMs, content.song.frameMs, content.song.durationMs),
      ),
    )
}

/**
 * Returns true when the edge of the mark of the open song can move by one frame size or more.
 * Returns false when no song is open or no mark has the id.
 * @param id The id of the mark.
 * @param edge The edge to move.
 */
export function canResizeMark(id: string, edge: 'start' | 'end'): boolean {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  if (!content || !mark) return false
  const limits = edgeLimits(
    content.marks,
    mark,
    edge,
    content.song.frameMs,
    content.song.durationMs,
  )
  return limits.minMs < limits.maxMs
}
