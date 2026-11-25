import type { Mark } from '../../store/types.ts'
import { findMark, nextOnLayer } from './family.ts'
import { previewDelete } from './deleteRules.ts'
import { isEmptyEdit } from './markEdit.ts'
import { previewMove, previewResize } from './moveRules.ts'
import { splitTime } from './splitRules.ts'
import { formatTime } from '../time/formatTime.ts'
import { snap } from '../time/snap.ts'
import type { LimitCause } from './limits.ts'

/**
 * The cause that keeps an edit action from acting. A button shows the text of the cause in its tooltip,
 * and the status line of the editor shows the same text after a key that does nothing.
 */
export type EditBlock =
  | 'select-one'
  | 'select-mark'
  | 'cursor-outside'
  | 'cursor-at-edge'
  | 'last-on-layer'
  | 'next-in-other-phrase'
  | 'next-in-other-word'
  | 'last-phoneme'
  | 'select-phrase'
  | 'select-range'
  | 'select-mark-or-range'
  | 'audio-not-ready'
  | 'no-room'
  | 'edge-no-room'

const BLOCK_TEXTS: Record<EditBlock, string> = {
  'select-one': 'Select one mark first.',
  'select-mark': 'Select a mark first.',
  'cursor-outside': 'Move the play cursor into the mark. Then press S.',
  'cursor-at-edge':
    'Move the play cursor away from the edge of the mark. Each part needs one frame size or more.',
  'last-on-layer': 'This is the last mark of the layer.',
  'next-in-other-phrase': 'The next word is in another phrase.',
  'next-in-other-word': 'The next phoneme is in another word.',
  'last-phoneme': 'A word needs one phoneme or more. Delete the word.',
  'select-phrase': 'Select a phrase first.',
  'select-range': 'Drag on the waveform to select a time range first.',
  'select-mark-or-range': 'Select a mark or a time range first.',
  'audio-not-ready': 'The audio is not ready.',
  'no-room': 'The mark has no room to move.',
  'edge-no-room': 'The edge of the mark has no room to move.',
}

/** Returns the text that the person sees for the cause. The copy is in the timeline editor feature file. */
export function blockText(block: EditBlock): string {
  return BLOCK_TEXTS[block]
}

/** Returns the only selected mark, or undefined when the selection does not hold exactly one mark of the song. */
function onlyMark(marks: readonly Mark[], ids: readonly string[]): Mark | undefined {
  return ids.length === 1 ? findMark(marks, ids[0] ?? '') : undefined
}

/**
 * Returns the cause that keeps a split at the play cursor from acting, or null when the split acts.
 * The rules are those of `splitTime`.
 * @param marks The marks of the song.
 * @param ids The selected marks.
 * @param atMs The play cursor.
 * @param frameMs The frame size of the song.
 */
export function splitBlock(
  marks: readonly Mark[],
  ids: readonly string[],
  atMs: number,
  frameMs: number,
): EditBlock | null {
  const mark = onlyMark(marks, ids)
  if (!mark) return 'select-one'
  if (atMs <= mark.startMs || atMs >= mark.endMs) return 'cursor-outside'
  return splitTime(marks, mark, atMs, frameMs) === undefined ? 'cursor-at-edge' : null
}

/**
 * Returns the cause that keeps a merge with the next mark from acting, or null when the merge acts.
 * The rules are those of `mergePartner`.
 * @param marks The marks of the song.
 * @param ids The selected marks.
 */
export function mergeBlock(marks: readonly Mark[], ids: readonly string[]): EditBlock | null {
  const mark = onlyMark(marks, ids)
  if (!mark) return 'select-one'
  const next = nextOnLayer(marks, mark)
  if (!next) return 'last-on-layer'
  if (next.parentId === mark.parentId) return null
  return mark.layer === 'word' ? 'next-in-other-phrase' : 'next-in-other-word'
}

/**
 * Returns the cause that keeps a delete of the selected marks from acting, or null when the delete acts.
 * The rules are those of `previewDelete`.
 * @param marks The marks of the song.
 * @param ids The selected marks.
 */
export function deleteBlock(marks: readonly Mark[], ids: readonly string[]): EditBlock | null {
  if (!ids.some((id) => findMark(marks, id))) return 'select-mark'
  return isEmptyEdit(previewDelete(marks, ids)) ? 'last-phoneme' : null
}

/**
 * Returns the cause that keeps a label edit from acting, or null when exactly one mark is selected.
 * @param marks The marks of the song.
 * @param ids The selected marks.
 */
export function labelBlock(marks: readonly Mark[], ids: readonly string[]): EditBlock | null {
  return onlyMark(marks, ids) ? null : 'select-one'
}

/**
 * Returns `no-room` when a move of the mark by a frame size or more changes nothing, else null.
 * A move of less than half a frame size snaps to no move, so it is not a cause.
 * @param marks The marks of the song.
 * @param id The mark.
 * @param deltaMs The amount of the move.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function moveBlock(
  marks: readonly Mark[],
  id: string,
  deltaMs: number,
  frameMs: number,
  durationMs: number,
): EditBlock | null {
  if (snap(deltaMs, frameMs) === 0) return null
  return isEmptyEdit(previewMove(marks, id, deltaMs, frameMs, durationMs)) ? 'no-room' : null
}

/**
 * Returns `edge-no-room` when a resize of the edge to a new frame changes nothing, else null.
 * @param marks The marks of the song.
 * @param id The mark.
 * @param edge The edge.
 * @param toMs The new time of the edge.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function resizeBlock(
  marks: readonly Mark[],
  id: string,
  edge: 'start' | 'end',
  toMs: number,
  frameMs: number,
  durationMs: number,
): EditBlock | null {
  const mark = findMark(marks, id)
  const edgeMs = edge === 'start' ? mark?.startMs : mark?.endMs
  if (edgeMs === undefined || snap(toMs, frameMs) === edgeMs) return null
  const edit = previewResize(marks, id, edge, toMs, frameMs, durationMs)
  return isEmptyEdit(edit) ? 'edge-no-room' : null
}

const CAUSE_TEXTS: Record<LimitCause, string> = {
  snap: 'a multiple of the frame size',
  parent: 'the edge of the parent mark',
  song: 'the last frame of the song',
  adjacent: 'the shortest length of the adjacent mark',
  shortest: 'the shortest length of the mark',
  words: 'the edge of the first or the last word of the phrase',
}

/**
 * Returns the status text for a typed time that a rule changed, for example
 * "The app used 0:03.500, a multiple of the frame size."
 * @param usedMs The time that the app stored.
 * @param cause The rule that changed the time.
 */
export function usedTimeText(usedMs: number, cause: LimitCause): string {
  return `The app used ${formatTime(usedMs)}, ${CAUSE_TEXTS[cause]}.`
}
