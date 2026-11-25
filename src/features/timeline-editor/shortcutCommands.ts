// The key functions of the editor shortcuts. Each reads the stores when it runs.
// Each returns false when it does not act, so the dispatcher gives the key to the next registration or to the browser.

import {
  blockText,
  deleteBlock,
  type EditBlock,
  mergeBlock,
  moveBlock,
  resizeBlock,
  splitBlock,
} from '../../lib/marks/editBlocks.ts'
import { markOnNextLayer } from '../../lib/marks/selection.ts'
import { extendRange, stepTime } from '../../lib/time/timeSteps.ts'
import { mergeWithNext } from '../../store/actions/mergeWithNext.ts'
import { moveMark } from '../../store/actions/moveMark.ts'
import { resizeMark } from '../../store/actions/resizeMark.ts'
import { splitMark } from '../../store/actions/splitMark.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, SongContent } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { deleteSelectedMarks, selectAndReveal } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'
import { pauseOnRefusal, usePlayerStore } from './playerStore.ts'
import { reportStatus } from './statusStore.ts'
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

// The person clicks these buttons during play, for example "75%", so `Space` keeps its play meaning there.
// `Enter` still presses the button.
const PLAY_SPACE_SELECTOR = '.editor-toolbar button, .transport button'

// "Play" plays with its own click, and a menu, a list and a dialog use the space bar themselves.
const OWN_SPACE_SELECTOR = '.play, [role="menu"], [role="listbox"], [role="dialog"]'

/** Returns true when `Space` plays from the focus of the event. */
function spacePlays(event: KeyboardEvent): boolean {
  if (!fromControl(event)) return true
  const { target } = event
  return (
    target instanceof Element &&
    target.closest(PLAY_SPACE_SELECTOR) !== null &&
    target.closest(OWN_SPACE_SELECTOR) === null
  )
}

/**
 * `Space`: plays or pauses the audio. A loop stops through the same pause.
 * On a button of the toolbar or the transport other than "Play", it plays or pauses and does not press the button.
 * It does not act on any other focused button, link or field, because those controls use the space bar.
 * It does not act while the audio is not ready. A held key toggles one time only.
 */
export function togglePlay(event: KeyboardEvent): boolean {
  const { player } = usePlayerStore.getState()
  if (player === null || !spacePlays(event)) return false
  if (event.repeat) return true
  if (player.isPlaying()) player.pause()
  else pauseOnRefusal(player, player.play())
  return true
}

/** Returns the marks of the open song. */
function songMarks(): readonly Mark[] {
  return useSongStore.getState().current?.marks ?? []
}

/**
 * Shows the reason in the status line when the cause is not null.
 * Returns true when the cause is null, so the action runs.
 * A key function that does not act still returns false, so the key goes on to the next registration or to the browser.
 */
function clear(block: EditBlock | null): boolean {
  if (block !== null) reportStatus(blockText(block))
  return block === null
}

/**
 * `S`: splits the only selected mark at the play cursor. The first part keeps the id, so it stays selected.
 * When the split is not possible, for example with the play cursor outside the mark, the status line states the reason.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function splitAtCursor(event: KeyboardEvent): boolean {
  const { selectedMarkIds, playTimeMs } = useViewStore.getState()
  const frameMs = useSongStore.getState().current?.song.frameMs ?? 0
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy()) return false
  if (!clear(splitBlock(songMarks(), selectedMarkIds, playTimeMs, frameMs))) return false
  splitMark(selectedMarkIds[0] ?? '', playTimeMs)
  return true
}

/**
 * `M`: merges the only selected mark with the next mark on its layer. The merged mark keeps the id, so it stays selected.
 * On the last mark of a layer or across a parent edge, the status line states the reason.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function mergeSelected(event: KeyboardEvent): boolean {
  const ids = useViewStore.getState().selectedMarkIds
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy()) return false
  if (!clear(mergeBlock(songMarks(), ids))) return false
  mergeWithNext(ids[0] ?? '')
  return true
}

/**
 * `Delete`: deletes the selected marks with their children, as one undo step. See `deleteSelectedMarks`.
 * For the last phoneme of a word, the status line states the reason.
 * It does not act on a focused form control, such as the zoom slider or a checkbox.
 */
export function deleteSelected(event: KeyboardEvent): boolean {
  if (fromControl(event, FORM_CONTROL_SELECTOR) || editorBusy()) return false
  if (!clear(deleteBlock(songMarks(), useViewStore.getState().selectedMarkIds))) return false
  return deleteSelectedMarks()
}

/** Moves the mark or one edge by one frame size, or shows in the status line that it has no room to move. */
function nudgeMark(
  content: SongContent,
  mark: Mark,
  part: 'body' | 'start' | 'end',
  direction: 1 | -1,
): void {
  const { frameMs, durationMs } = content.song
  const deltaMs = direction * frameMs
  if (part === 'body') {
    if (clear(moveBlock(content.marks, mark.id, deltaMs, frameMs, durationMs)))
      moveMark(mark.id, deltaMs)
    return
  }
  const toMs = (part === 'start' ? mark.startMs : mark.endMs) + deltaMs
  if (clear(resizeBlock(content.marks, mark.id, part, toMs, frameMs, durationMs)))
    resizeMark(mark.id, part, toMs)
}

/**
 * Returns the key function that moves the only selected mark, or one edge of it, by one frame size.
 * - `Left` and `Right` move the mark. With no selected mark, they move the play cursor (see `stepCursor`).
 * - `Alt+Left` and `Alt+Right` move the start. `Shift+Alt+Left` and `Shift+Alt+Right` move the end.
 * The action clamps the move to the limits of the mark, so a move past a limit changes nothing.
 * The status line then states that the mark or the edge has no room to move.
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
    nudgeMark(content, mark, part, direction)
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
