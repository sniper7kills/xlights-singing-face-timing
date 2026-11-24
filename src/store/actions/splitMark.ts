import { isEmptyEdit } from '../../lib/marks/markEdit.ts'
import { previewSplit } from '../../lib/marks/splitRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit, newMarkId } from './commitMarkEdit.ts'

/**
 * Splits a mark of the open song at `atMs` into two marks, as one undo step. The rules are those of `previewSplit`.
 * An unedited word gets a new break down of both parts in the same step, when the dictionary is in memory.
 * A call that is not possible changes nothing and records no step.
 * @param id The id of the mark. An unknown id changes nothing.
 * @param atMs The time of the split, usually the play cursor.
 */
export function splitMark(id: string, atMs: number): void {
  useSongStore
    .getState()
    .apply((content) =>
      commitMarkEdit(
        content,
        previewSplit(content.marks, id, atMs, content.song.frameMs, newMarkId),
      ),
    )
}

/**
 * Returns true when `splitMark` with the same arguments changes the open song.
 * Returns false when no song is open, no mark has the id, or a part would be shorter than one frame size.
 * A time outside the mark always gives false.
 * @param id The id of the mark.
 * @param atMs The time of the split.
 */
export function canSplitMark(id: string, atMs: number): boolean {
  const content = useSongStore.getState().current
  return (
    content !== null &&
    !isEmptyEdit(previewSplit(content.marks, id, atMs, content.song.frameMs, newMarkId))
  )
}
