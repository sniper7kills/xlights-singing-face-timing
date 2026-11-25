// The commands that the pointer, the keys and the label controls of the layers share.
// They read the stores when they run, so a component can call them from an event handler.

import type { PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'
import { findMark, nextOnLayer, previousOnLayer } from '../../lib/marks/family.ts'
import { marksBetween } from '../../lib/marks/selection.ts'
import { addMark } from '../../store/actions/addMark.ts'
import { canDeleteMarks, deleteMarks } from '../../store/actions/deleteMarks.ts'
import { setMarkLabel, wordsWouldChange } from '../../store/actions/setMarkLabel.ts'
import { setPhonemeLabel } from '../../store/actions/setPhonemeLabel.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { type LabelTarget, layerFocusId, useMarkUiStore } from './markUiStore.ts'
import { followCursor } from './timeScale.ts'
import { currentStageInput } from './useStageScale.ts'

type AddTarget = Extract<LabelTarget, { kind: 'add' }>

function songMarks() {
  return useSongStore.getState().current?.marks ?? []
}

/**
 * Applies a click on a mark to the selection.
 * - With Shift, the selection becomes the marks from the anchor to the clicked mark on one layer, and the anchor stays.
 *   The anchor is the mark of the last click without Shift.
 * - A click on the only selected phoneme opens the phoneme label list.
 * - Any other click selects only the clicked mark, and the clicked mark becomes the anchor.
 * A click on an id that is not in the song changes nothing.
 * @param id The clicked mark.
 * @param shiftKey True when the person holds Shift.
 */
export function clickMark(id: string, shiftKey: boolean): void {
  const view = useViewStore.getState()
  const mark = findMark(songMarks(), id)
  if (!mark) return
  const anchorId = view.selectionAnchorId
  if (shiftKey && anchorId !== null) {
    const ids = marksBetween(songMarks(), anchorId, id)
    // An anchor on another layer gives only the clicked mark, which then becomes the anchor.
    if (ids.includes(anchorId)) view.extendSelection(ids)
    else view.selectMarks(ids)
    return
  }
  const only = view.selectedMarkIds.length === 1 && view.selectedMarkIds[0] === id
  if (only && mark.layer === 'phoneme') {
    useMarkUiStore.getState().openLabel({ control: 'menu', target: { kind: 'edit', id } })
    return
  }
  view.selectMarks([id])
}

/**
 * Opens the label control of the mark: the phoneme label list for a phoneme, else the text field.
 * Returns false when no mark has the id.
 */
export function editLabel(id: string): boolean {
  const mark = findMark(songMarks(), id)
  if (!mark) return false
  const control = mark.layer === 'phoneme' ? 'menu' : 'text'
  useMarkUiStore.getState().openLabel({ control, target: { kind: 'edit', id } })
  return true
}

/**
 * Closes the open label control with no change.
 * @param target The mark or the range of the control.
 * @param refocus True gives the focus back to the mark, or to the layer track for an add.
 * A control that loses the focus to another control passes false.
 */
export function closeLabel(target: LabelTarget, refocus = true): void {
  useMarkUiStore.getState().openLabel(null)
  if (!refocus) return
  useMarkUiStore
    .getState()
    .requestFocus(target.kind === 'edit' ? target.id : layerFocusId(target.voiceId, target.layer))
}

/**
 * Adds the mark of an add target and selects it. The focus goes to the new mark when `refocus` is true.
 * An add that is not possible keeps the focus request of `closeLabel` on the layer track.
 */
function addAndSelect(target: AddTarget, label: string, refocus: boolean): void {
  const id = addMark(target.voiceId, target.layer, target.startMs, target.endMs, label)
  if (id === null) return
  useViewStore.getState().selectMarks([id])
  if (refocus) useMarkUiStore.getState().requestFocus(id)
}

/**
 * Saves the text of the label text field.
 * - An empty text keeps the old label, or adds no mark.
 * - A phrase label that changes the words of the phrase waits for the confirm dialog.
 * - Any other text goes to `setMarkLabel`, or to `addMark`, which selects the new mark.
 * @param target The mark or the range of the field.
 * @param text The text of the field.
 * @param refocus True gives the focus back to the mark. A field that loses the focus to another control passes false.
 */
export function saveLabel(target: LabelTarget, text: string, refocus = true): void {
  if (target.kind === 'edit' && wordsWouldChange(target.id, text)) {
    // The dialog takes the focus, so the mark must not take it back.
    useMarkUiStore.getState().openLabel(null)
    useMarkUiStore.getState().setPending({ id: target.id, label: text })
    return
  }
  closeLabel(target, refocus)
  if (text.trim() === '') return
  if (target.kind === 'add') addAndSelect(target, text, refocus)
  else setMarkLabel(target.id, text)
}

/** Sets the phoneme label that the person chooses from the list, or adds a phoneme with it and selects the phoneme. */
export function choosePhoneme(target: LabelTarget, label: PhonemeLabel): void {
  closeLabel(target)
  if (target.kind === 'add') addAndSelect(target, label, true)
  else setPhonemeLabel(target.id, label)
}

/**
 * Ends the confirm dialog of a phrase label.
 * @param confirmed True for "Continue", which rebuilds the words. False keeps the old label.
 */
export function endPending(confirmed: boolean): void {
  const ui = useMarkUiStore.getState()
  const { pending } = ui
  if (pending === null) return
  ui.setPending(null)
  ui.requestFocus(pending.id)
  if (confirmed) setMarkLabel(pending.id, pending.label)
}

/**
 * Deletes the selected marks with their children, as one undo step.
 * The selection then keeps only the marks that still exist (see `keepSelectionInSong`).
 * When the selection is then empty, the focus goes to the layer track of the first deleted mark, so the focus stays in the layers.
 * Returns false when the delete changes nothing, for example for the last phoneme of a word.
 */
export function deleteSelectedMarks(): boolean {
  const ids = useViewStore.getState().selectedMarkIds
  const first = findMark(songMarks(), ids[0] ?? '')
  if (!first || !canDeleteMarks(ids)) return false
  deleteMarks(ids)
  if (useViewStore.getState().selectedMarkIds.length === 0)
    useMarkUiStore.getState().requestFocus(layerFocusId(first.voiceId, first.layer))
  return true
}

/**
 * Selects the next or the previous mark on the layer of a mark, and gives it the focus.
 * The view scrolls when that mark is out of view.
 * Returns false when no mark has the id, or when no mark is in that direction.
 * @param id The mark that has the focus.
 * @param direction 1 selects the next mark, -1 the previous mark.
 */
export function stepSelection(id: string, direction: 1 | -1): boolean {
  const content = useSongStore.getState().current
  const marks = content?.marks ?? []
  const mark = findMark(marks, id)
  const next = mark && (direction === 1 ? nextOnLayer(marks, mark) : previousOnLayer(marks, mark))
  if (!content || !next) return false
  selectAndReveal(next, content.song.durationMs)
  return true
}

/**
 * Selects only the mark, scrolls the view when the mark start is out of view, and gives the mark the focus.
 * @param mark The mark to select.
 * @param durationMs The length of the song, for the time scale of the stage.
 */
export function selectAndReveal(mark: Mark, durationMs: number): void {
  useViewStore.getState().selectMarks([mark.id])
  const scrollMs = followCursor(currentStageInput(durationMs), mark.startMs)
  if (scrollMs !== null) useViewStore.getState().setScroll(scrollMs)
  useMarkUiStore.getState().requestFocus(mark.id)
}
