import type { Mark } from '../../store/types.ts'
import { findMark, nextOnLayer } from './family.ts'
import { previewDelete } from './deleteRules.ts'
import { isEmptyEdit } from './markEdit.ts'
import { splitTime } from './splitRules.ts'

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
