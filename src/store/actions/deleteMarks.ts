import { previewDelete } from '../../lib/marks/deleteRules.ts'
import { isEmptyEdit } from '../../lib/marks/markEdit.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Deletes the marks of the open song, with their children, as one undo step. The rules are those of `previewDelete`.
 * The action ignores the id of the last phoneme of a word. A call that deletes nothing records no step.
 * @param ids The ids of the marks, usually the selected marks. An unknown id changes nothing.
 */
export function deleteMarks(ids: readonly string[]): void {
  useSongStore
    .getState()
    .apply((content) => commitMarkEdit(content, previewDelete(content.marks, ids)))
}

/**
 * Returns true when `deleteMarks` with the same ids deletes one mark or more of the open song.
 * Returns false when no song is open, or when each id is unknown or the last phoneme of its word.
 * @param ids The ids of the marks.
 */
export function canDeleteMarks(ids: readonly string[]): boolean {
  const content = useSongStore.getState().current
  return content !== null && !isEmptyEdit(previewDelete(content.marks, ids))
}
