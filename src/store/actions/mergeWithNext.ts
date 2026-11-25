import { previewMerge } from '../../lib/marks/mergeRules.ts'
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
