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
