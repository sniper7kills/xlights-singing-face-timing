// The key functions of the editor shortcuts. Each reads the stores when it runs.
// Each returns false when it does not act, so the dispatcher gives the key to the next registration or to the browser.

import { markOnNextLayer } from '../../lib/marks/selection.ts'
import { extendRange, stepTime } from '../../lib/time/timeSteps.ts'
import { canMergeWithNext, mergeWithNext } from '../../store/actions/mergeWithNext.ts'
import { moveMark } from '../../store/actions/moveMark.ts'
import { resizeMark } from '../../store/actions/resizeMark.ts'
import { canSplitMark, splitMark } from '../../store/actions/splitMark.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { deleteSelectedMarks, selectAndReveal } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'
import { pauseOnRefusal, usePlayerStore } from './playerStore.ts'
import { followCursor } from './timeScale.ts'
import { currentStageInput } from './useStageScale.ts'

/** A key function of an editor shortcut. It returns false when it does not act. */
export type KeyRun = (event: KeyboardEvent) => boolean

// A form control changes its own value with the keys, for example a checkbox with the space bar.
// The dispatcher lets the keys of a range input, a checkbox and a radio through, so each shortcut checks the focus.
const FORM_CONTROL_SELECTOR =
  'input, select, textarea, [contenteditable], [role="slider"], [role="listbox"], [role="dialog"]'

// A button and a link also use the space bar or the arrow keys themselves.
const CONTROL_SELECTOR = `button, a[href], ${FORM_CONTROL_SELECTOR}`

/**
 * Returns true when the focus is on a control that uses the key itself.
 * @param selector `CONTROL_SELECTOR` for a key that a button or a link uses. `FORM_CONTROL_SELECTOR` for a key that only a form control uses.
 */
function fromControl(event: KeyboardEvent, selector = CONTROL_SELECTOR): boolean {
  return event.target instanceof Element && event.target.closest(selector) !== null
}

/**
 * Returns true while a label control, the confirm dialog of a phrase label or a mark drag is active.
 * An edit or an undo step then would change the marks under the open control or the drag, so the edit shortcuts do not act.
 */
function editorBusy(): boolean {
  const ui = useMarkUiStore.getState()
  return ui.open !== null || ui.pending !== null || ui.dragging
}

/** Returns the selected mark when exactly one mark is selected, else undefined. */
function onlySelected(): Mark | undefined {
  const ids = useViewStore.getState().selectedMarkIds
  const marks = useSongStore.getState().current?.marks ?? []
  return ids.length === 1 ? marks.find((mark) => mark.id === ids[0]) : undefined
}

/**
 * `Space`: plays or pauses the audio. A loop stops through the same pause.
 * It does not act on a focused button, link or field, because those controls use the space bar.
 * It does not act while the audio is not ready. A held key toggles one time only.
 */
export function togglePlay(event: KeyboardEvent): boolean {
  const { player } = usePlayerStore.getState()
  if (player === null || fromControl(event)) return false
  if (event.repeat) return true
  if (player.isPlaying()) player.pause()
  else pauseOnRefusal(player, player.play())
  return true
}

/**
 * `S`: splits the only selected mark at the play cursor. The first part keeps the id, so it stays selected.
 * It does not act when the split is not possible, for example with the play cursor outside the mark.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function splitAtCursor(event: KeyboardEvent): boolean {
  const mark = onlySelected()
  const atMs = useViewStore.getState().playTimeMs
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy() || !mark) return false
  if (!canSplitMark(mark.id, atMs)) return false
  splitMark(mark.id, atMs)
  return true
}

/**
 * `M`: merges the only selected mark with the next mark on its layer. The merged mark keeps the id, so it stays selected.
 * It does not act on the last mark of a layer or across a parent edge.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function mergeSelected(event: KeyboardEvent): boolean {
  const mark = onlySelected()
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy()) return false
  if (!mark || !canMergeWithNext(mark.id)) return false
  mergeWithNext(mark.id)
  return true
}

/**
 * `Delete`: deletes the selected marks with their children, as one undo step. See `deleteSelectedMarks`.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function deleteSelected(event: KeyboardEvent): boolean {
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy()) return false
  return deleteSelectedMarks()
}

/**
 * Returns the key function that moves the only selected mark, or one edge of it, by one frame size.
 * - `Left` and `Right` move the mark. With no selected mark, they move the play cursor (see `stepCursor`).
 * - `Alt+Left` and `Alt+Right` move the start. `Shift+Alt+Left` and `Shift+Alt+Right` move the end.
 * The action clamps the move to the limits of the mark, so a move past a limit changes nothing.
 * The key function takes the key also when the move changes nothing, because `Alt+Left` is the browser shortcut for "back".
 * @param part The part of the mark that moves.
 * @param direction 1 moves later, -1 earlier.
 */
export function nudge(part: 'body' | 'start' | 'end', direction: 1 | -1): KeyRun {
  return (event) => {
    const mark = onlySelected()
    const content = useSongStore.getState().current
    if (part === 'body' && !mark) return stepCursor(direction, false)(event)
    if (fromControl(event) || editorBusy() || !mark || !content) return false
    const deltaMs = direction * content.song.frameMs
    if (part === 'body') moveMark(mark.id, deltaMs)
    else resizeMark(mark.id, part, (part === 'start' ? mark.startMs : mark.endMs) + deltaMs)
    return true
  }
}

/**
 * Returns the key function that moves the play cursor to the next frame in one direction.
 * The view scrolls when the play cursor leaves the view.
 * @param direction 1 moves later, -1 earlier.
 * @param extend True also extends the time selection from the play cursor (`Shift+Left`, `Shift+Right`). See `extendRange`.
 */
export function stepCursor(direction: 1 | -1, extend: boolean): KeyRun {
  return (event) => {
    const content = useSongStore.getState().current
    if (fromControl(event) || !content) return false
    const view = useViewStore.getState()
    const { frameMs, durationMs } = content.song
    const toMs = stepTime(view.playTimeMs, direction, frameMs, durationMs)
    if (extend) view.setSelection(extendRange(view.selection, view.playTimeMs, toMs))
    view.setPlayTime(toMs)
    usePlayerStore.getState().player?.seek(toMs)
    const scrollMs = followCursor(currentStageInput(durationMs), toMs)
    if (scrollMs !== null) view.setScroll(scrollMs)
    return true
  }
}

/**
 * Returns the key function of `Up` or `Down`: it selects the parent of the only selected mark, or its first child in time.
 * It does not act when that mark does not exist.
 * @param direction `up` goes to the layer above, `down` to the layer below.
 */
export function stepLayer(direction: 'up' | 'down'): KeyRun {
  return (event) => {
    const mark = onlySelected()
    const content = useSongStore.getState().current
    if (fromControl(event) || editorBusy() || !mark || !content) return false
    const target = markOnNextLayer(content.marks, mark, direction)
    if (!target) return false
    selectAndReveal(target, content.song.durationMs)
    return true
  }
}

/**
 * `Ctrl+Z` undoes the last step, and `Ctrl+Shift+Z` redoes it. `Cmd` works the same on macOS.
 * The function reads Shift from the event, because Caps Lock gives the key `Z` with no Shift.
 * It does not act when the history has no step in that direction, or while a label control or a drag is active.
 */
export function undoOrRedo(event: KeyboardEvent): boolean {
  const store = useSongStore.getState()
  const steps = event.shiftKey ? store.history.future : store.history.past
  if (editorBusy() || steps.length === 0) return false
  if (event.shiftKey) store.redo()
  else store.undo()
  return true
}
