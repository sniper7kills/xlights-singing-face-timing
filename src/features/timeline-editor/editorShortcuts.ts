import {
  deleteSelected,
  type KeyRun,
  mergeSelected,
  nudge,
  splitAtCursor,
  stepCursor,
  stepLayer,
  togglePlay,
  undoOrRedo,
} from './shortcutCommands.ts'
import type { EditorKeyMap } from './useEditorKeys.ts'
import { zoomSelectionKey } from './zoomCommands.ts'

/** One row of the shortcut list: the keys that the person presses and what they do. */
export type Shortcut = {
  /** The keys as the shortcut list shows them. */
  label: string
  /** What the keys do. */
  action: string
  /**
   * The key names in the format of `EditorKeyMap`, with their key functions.
   * A null function marks a key that another component registers:
   * - `TransportControls` registers `L`.
   * - `Layers` registers `[`, `]`, `Enter`, `F2` and `Escape`.
   * An entry with no key names describes a browser key that the editor does not change, such as `Tab`.
   * - `ZoomControl` registers `+`, `=` and `-`.
   * - `ShortcutList` registers `?`, because it holds the open state of the list.
   */
  keys: Readonly<Record<string, KeyRun | null>>
}

/**
 * The shortcuts of the editor, in the order of "Behaviour rules" in the timeline editor feature file.
 * A letter has an entry for the lower case and the upper case, so the key acts with Caps Lock or Shift.
 * `Ctrl+z` and `Ctrl+Z` both go to `undoOrRedo`, which reads Shift from the event.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    label: 'Space',
    action: 'Play or pause, also from a button of the toolbar. Enter presses the button',
    keys: { ' ': togglePlay },
  },
  { label: 'L', action: 'Play the selection in a loop', keys: { l: null, L: null } },
  {
    label: 'S',
    action: 'Split the selected mark at the play cursor',
    keys: { s: splitAtCursor, S: splitAtCursor },
  },
  {
    label: 'M',
    action: 'Merge the selected mark with the next mark',
    keys: { m: mergeSelected, M: mergeSelected },
  },
  { label: 'Delete', action: 'Delete the selected marks', keys: { Delete: deleteSelected } },
  { label: 'Enter or F2', action: 'Edit the label', keys: { Enter: null, F2: null } },
  {
    label: '[ or ]',
    action: 'Select the previous or the next mark of the layer',
    keys: { '[': null, ']': null },
  },
  {
    label: 'Up or Down',
    action: 'Select the mark on the layer above or below',
    keys: { ArrowUp: stepLayer('up'), ArrowDown: stepLayer('down') },
  },
  {
    label: 'Left or Right',
    action:
      'Move the selected mark by one frame size. With no selected mark, move the play cursor by one frame size',
    keys: { ArrowLeft: nudge('body', -1), ArrowRight: nudge('body', 1) },
  },
  {
    label: 'Alt+Left or Alt+Right',
    action: 'Move the start of the selected mark by one frame size',
    keys: { 'Alt+ArrowLeft': nudge('start', -1), 'Alt+ArrowRight': nudge('start', 1) },
  },
  {
    label: 'Shift+Alt+Left or Shift+Alt+Right',
    action: 'Move the end of the selected mark by one frame size',
    keys: { 'Alt+Shift+ArrowLeft': nudge('end', -1), 'Alt+Shift+ArrowRight': nudge('end', 1) },
  },
  {
    label: 'Shift+Left or Shift+Right',
    action: 'Make the time selection longer or shorter from the play cursor',
    keys: { 'Shift+ArrowLeft': stepCursor(-1, true), 'Shift+ArrowRight': stepCursor(1, true) },
  },
  { label: 'Ctrl+Z', action: 'Undo', keys: { 'Ctrl+z': undoOrRedo } },
  { label: 'Ctrl+Shift+Z', action: 'Redo', keys: { 'Ctrl+Z': undoOrRedo } },
  { label: '+ or -', action: 'Zoom in or out', keys: { '+': null, '=': null, '-': null } },
  {
    label: 'Z',
    action: 'Zoom to the selected marks or the time selection',
    keys: { z: zoomSelectionKey, Z: zoomSelectionKey },
  },
  { label: 'Escape', action: 'Clear the mark selection', keys: { Escape: null } },
  { label: '?', action: 'Show this list', keys: { '?': null } },
  {
    label: 'Tab or Shift+Tab',
    action: 'Go to the next or the previous layer or control. Each layer is one stop',
    keys: {},
  },
]

/** The key functions of `SHORTCUTS` that this table registers, for `useEditorKeys`. */
export const SHORTCUT_KEYS: EditorKeyMap = Object.fromEntries(
  SHORTCUTS.flatMap((shortcut) =>
    Object.entries(shortcut.keys).filter((entry): entry is [string, KeyRun] => entry[1] !== null),
  ),
)
