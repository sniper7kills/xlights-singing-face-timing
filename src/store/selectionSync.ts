import { findMark } from '../lib/marks/family.ts'
import { existingIds } from '../lib/marks/selection.ts'
import { useSongStore } from './songStore.ts'
import { useViewStore } from './viewStore.ts'

/**
 * Keeps the mark selection inside the open song. After each change of the marks, the selection keeps only the ids that still name a mark.
 * The rule covers every change, so each action gets the same result:
 * - Delete removes the deleted marks from the selection. A kept last phoneme of a word stays selected.
 * - A split keeps the id of the first part, so the first part stays selected.
 * - A merge keeps the id of the first mark, so the merged mark stays selected.
 * - Undo and redo keep the selected ids that exist after the step.
 * The anchor stays when its mark exists. Else the last kept id becomes the anchor.
 * Returns the function that stops the rule.
 */
export function keepSelectionInSong(): () => void {
  return useSongStore.subscribe((state, previous) => {
    const marks = state.current?.marks ?? []
    if (marks === previous.current?.marks) return
    const view = useViewStore.getState()
    const kept = existingIds(marks, view.selectedMarkIds)
    if (kept.length === view.selectedMarkIds.length) return
    const anchorId = view.selectionAnchorId
    useViewStore.setState({
      selectedMarkIds: kept,
      selectionAnchorId:
        anchorId !== null && findMark(marks, anchorId) ? anchorId : (kept.at(-1) ?? null),
    })
  })
}
