import type { Mark } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import { descendantsOf, findMark, nextOnLayer, previousOnLayer } from './family.ts'
import { clamp, edgeLimits, moveLimits } from './limits.ts'
import { noEdit, type MarkEdit } from './markEdit.ts'
import { phonemesAfterResize } from './phonemes.ts'

/**
 * Returns the mark that the person moves or resizes, in its new state.
 * The mark loses the "estimated" state. A phoneme gets `edited`.
 */
function handled(mark: Mark): Mark {
  const result = mark.estimated ? { ...mark, estimated: false } : mark
  return mark.layer === 'phoneme' ? { ...result, edited: true } : result
}

// A phoneme edit by hand sets `edited` on its word, so a later break down keeps the phonemes of the person.
function parentWordEdited(marks: readonly Mark[], mark: Mark): Mark[] {
  if (mark.layer !== 'phoneme' || mark.parentId === null) return []
  const word = findMark(marks, mark.parentId)
  return word && !word.edited ? [{ ...word, edited: true }] : []
}

/**
 * Returns the legal result of a move of the mark by `deltaMs`.
 *
 * The rules:
 * - The amount snaps to the frame size.
 * - The mark keeps its length.
 * - The mark stops at the adjacent mark on its layer. It does not jump over it.
 * - The mark stops at the parent edge. A phrase stops at 0 and at the end of the song.
 * - The words of a moved phrase and their phonemes move by the same amount.
 *   The phonemes of a moved word move by the same amount.
 *   A break down of a moved word gives the same phonemes at the new time, so the move keeps the phonemes.
 * - The moved mark loses the "estimated" state. A moved phoneme sets `edited` on itself and on its word.
 *
 * An amount past a limit gives the move to the limit.
 * @param marks The marks of the song.
 * @param id The id of the mark to move. An unknown id gives an empty edit.
 * @param deltaMs The amount to move, in milliseconds. A negative amount moves the mark earlier.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function previewMove(
  marks: readonly Mark[],
  id: string,
  deltaMs: number,
  frameMs: number,
  durationMs: number,
): MarkEdit {
  const mark = findMark(marks, id)
  if (!mark) return noEdit()
  const { minDeltaMs, maxDeltaMs } = moveLimits(marks, mark, frameMs, durationMs)
  const delta = clamp(snap(deltaMs, frameMs), minDeltaMs, maxDeltaMs)
  if (delta === 0) return noEdit()
  const shift = (item: Mark): Mark => ({
    ...item,
    startMs: item.startMs + delta,
    endMs: item.endMs + delta,
  })
  return {
    changed: [
      handled(shift(mark)),
      ...descendantsOf(marks, mark.id).map(shift),
      ...parentWordEdited(marks, mark),
    ],
    removedIds: [],
  }
}

/**
 * Returns the adjacent mark with its shared boundary at the new edge time.
 * The boundary is shared when the adjacent mark touches the edge before the drag, or when the edge reaches it.
 * A shared boundary moves in both directions, so the drag leaves no gap.
 */
function sharedNeighbour(
  marks: readonly Mark[],
  mark: Mark,
  edge: 'start' | 'end',
  timeMs: number,
): Mark[] {
  const atStart = edge === 'start'
  const neighbour = atStart ? previousOnLayer(marks, mark) : nextOnLayer(marks, mark)
  // A mark of a different parent never shares the boundary, because each child stays inside its parent.
  if (!neighbour || neighbour.parentId !== mark.parentId) return []
  const touches = atStart ? neighbour.endMs === mark.startMs : neighbour.startMs === mark.endMs
  const reached = atStart ? neighbour.endMs > timeMs : neighbour.startMs < timeMs
  if (!touches && !reached) return []
  return [atStart ? { ...neighbour, endMs: timeMs } : { ...neighbour, startMs: timeMs }]
}

function withPhonemes(marks: readonly Mark[], resized: readonly Mark[], frameMs: number): MarkEdit {
  const edits = resized
    .filter((mark) => mark.layer === 'word')
    .map((word) => {
      const before = findMark(marks, word.id) ?? word
      return phonemesAfterResize(marks, before, word, frameMs)
    })
  return {
    changed: [...resized, ...edits.flatMap((edit) => edit.changed)],
    removedIds: edits.flatMap((edit) => edit.removedIds),
  }
}

/**
 * Returns the legal result of a resize: one edge of the mark moves to `toMs`.
 *
 * The rules:
 * - The time snaps to the frame size.
 * - The shortest mark is one frame size. An edited word keeps one frame size for each phoneme.
 * - The edge stops at the parent edge: a word inside its phrase, a phoneme inside its word.
 * - A phrase edge stops at its first or last word. A change of the length of a phrase does not scale its words.
 * - When the edge touches or reaches the adjacent mark on the layer, the shared boundary of both marks moves.
 *   The edge stops when the adjacent mark has its shortest length.
 *   A shared boundary also moves back, so a shorter mark leaves no gap: the adjacent mark gets longer.
 * - No time goes below 0 or past the end of the song.
 * - The phonemes of each word that changes length follow the word. See `phonemesAfterResize`.
 * - The resized mark loses the "estimated" state. A resized phoneme sets `edited` on itself and on its word.
 *
 * A time past a limit gives the resize to the limit.
 * @param marks The marks of the song.
 * @param id The id of the mark to resize. An unknown id gives an empty edit.
 * @param edge The edge to move.
 * @param toMs The new time of the edge, in milliseconds.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function previewResize(
  marks: readonly Mark[],
  id: string,
  edge: 'start' | 'end',
  toMs: number,
  frameMs: number,
  durationMs: number,
): MarkEdit {
  const mark = findMark(marks, id)
  if (!mark) return noEdit()
  const { minMs, maxMs } = edgeLimits(marks, mark, edge, frameMs, durationMs)
  const timeMs = clamp(snap(toMs, frameMs), minMs, maxMs)
  const field = edge === 'start' ? 'startMs' : 'endMs'
  if (timeMs === mark[field]) return noEdit()
  const resized = [
    handled({ ...mark, [field]: timeMs }),
    ...sharedNeighbour(marks, mark, edge, timeMs),
  ]
  const edit = withPhonemes(marks, resized, frameMs)
  return { ...edit, changed: [...edit.changed, ...parentWordEdited(marks, mark)] }
}
