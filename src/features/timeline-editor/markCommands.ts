// The commands that the pointer, the keys and the label controls of the layers share.
// They read the stores when they run, so a component can call them from an event handler.

import type { PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'
import { findMark, nextOnLayer, previousOnLayer } from '../../lib/marks/family.ts'
import { marksBetween } from '../../lib/marks/selection.ts'
import { addMark } from '../../store/actions/addMark.ts'
import { setMarkLabel, wordsWouldChange } from '../../store/actions/setMarkLabel.ts'
import { setPhonemeLabel } from '../../store/actions/setPhonemeLabel.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { type LabelTarget, useMarkUiStore } from './markUiStore.ts'
import { followCursor } from './timeScale.ts'
import { currentStageInput } from './useStageScale.ts'

function songMarks() {
  return useSongStore.getState().current?.marks ?? []
}

/** Selects the mark and gives it the focus. The view scrolls when the mark is out of view. */
export function selectAndFocus(id: string): void {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  if (!content || !mark) return
  useViewStore.getState().selectMarks([id])
  const scrollMs = followCursor(currentStageInput(content.song.durationMs), mark.startMs)
  if (scrollMs !== null) useViewStore.getState().setScroll(scrollMs)
  useMarkUiStore.getState().requestFocus(id)
}

/**
 * Applies a click on a mark to the selection.
 * - With Shift, the selection becomes the marks from the last selected mark to the clicked mark on one layer.
 * - A click on the only selected phoneme opens the phoneme label list.
 * - Any other click selects only the clicked mark.
 * @param id The clicked mark.
 * @param shiftKey True when the person holds Shift.
 */
export function clickMark(id: string, shiftKey: boolean): void {
  const view = useViewStore.getState()
  const anchorId = view.selectedMarkIds.at(-1)
  if (shiftKey && anchorId !== undefined) {
    view.selectMarks(marksBetween(songMarks(), anchorId, id))
    return
  }
  const only = view.selectedMarkIds.length === 1 && anchorId === id
  if (only && findMark(songMarks(), id)?.layer === 'phoneme') {
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

/** Closes the open label control with no change. The focus goes back to the mark. */
export function closeLabel(target: LabelTarget): void {
  useMarkUiStore.getState().openLabel(null)
  if (target.kind === 'edit') useMarkUiStore.getState().requestFocus(target.id)
}

/**
 * Saves the text of the label text field.
 * - An empty text keeps the old label, or adds no mark.
 * - A phrase label that changes the words of the phrase waits for the confirm dialog.
 * - Any other text goes to `setMarkLabel` or to `addMark`.
 */
export function saveLabel(target: LabelTarget, text: string): void {
  if (target.kind === 'edit' && wordsWouldChange(target.id, text)) {
    // The dialog takes the focus, so the mark must not take it back.
    useMarkUiStore.getState().openLabel(null)
    useMarkUiStore.getState().setPending({ id: target.id, label: text })
    return
  }
  closeLabel(target)
  if (text.trim() === '') return
  if (target.kind === 'add')
    addMark(target.voiceId, target.layer, target.startMs, target.endMs, text)
  else setMarkLabel(target.id, text)
}

/** Sets the phoneme label that the person chooses from the list, or adds a phoneme with it. */
export function choosePhoneme(target: LabelTarget, label: PhonemeLabel): void {
  closeLabel(target)
  if (target.kind === 'add')
    addMark(target.voiceId, target.layer, target.startMs, target.endMs, label)
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
 * Selects the next or the previous mark on the layer of a mark, and gives it the focus.
 * Returns false when no mark has the id, or when no mark is in that direction.
 * @param id The mark that has the focus.
 * @param direction 1 selects the next mark, -1 the previous mark.
 */
export function stepSelection(id: string, direction: 1 | -1): boolean {
  const marks = songMarks()
  const mark = findMark(marks, id)
  const next = mark && (direction === 1 ? nextOnLayer(marks, mark) : previousOnLayer(marks, mark))
  if (!next) return false
  selectAndFocus(next.id)
  return true
}
