import { findMark } from '../../lib/marks/family.ts'
import { mergePartner, previewMerge } from '../../lib/marks/mergeRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Merges a mark of the open song with the next mark on its layer, as one undo step. The rules are those of `previewMerge`.
 * A merged word of two unedited words gets a new break down in the same step, when the dictionary is in memory.
 * A call that is not possible changes nothing and records no step.
 * @param id The id of the first mark. An unknown id changes nothing.
 */
export function mergeWithNext(id: string): void {
  useSongStore
    .getState()
    .apply((content) => commitMarkEdit(content, previewMerge(content.marks, id)))
}

/**
 * Returns true when the mark of the open song has a next mark on its layer with the same parent.
 * Returns false when no song is open, no mark has the id, the mark is the last mark of its layer,
 * or the next mark has a different parent.
 * @param id The id of the first mark.
 */
export function canMergeWithNext(id: string): boolean {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  return !!content && !!mark && mergePartner(content.marks, mark) !== undefined
}
