import type { FrameMs, Mark } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import type { MarkEdit } from './markEdit.ts'

/** The marks that share one parent range: the children of one mark, or the top marks of one layer of one voice. */
type Siblings = Map<string, Mark[]>

function groupKey(mark: Mark, ids: ReadonlySet<string>): string {
  // A word with no phrase has the song as its parent range, the same as a phrase.
  return mark.parentId !== null && ids.has(mark.parentId)
    ? mark.parentId
    : `top:${mark.voiceId}:${mark.layer}`
}

function groupSiblings(marks: readonly Mark[]): Siblings {
  const ids = new Set(marks.map((mark) => mark.id))
  const groups: Siblings = new Map()
  for (const mark of marks) {
    const key = groupKey(mark, ids)
    const group = groups.get(key)
    if (group) group.push(mark)
    else groups.set(key, [mark])
  }
  for (const group of groups.values()) group.sort((a, b) => a.startMs - b.startMs)
  return groups
}

/**
 * Returns the shortest legal length of each mark: one frame size, and for a parent the shortest lengths of its children together.
 * A word with three phonemes is three frame sizes or longer, so each phoneme keeps one frame size.
 */
function minimumLengths(groups: Siblings, frameMs: FrameMs): Map<string, number> {
  const lengths = new Map<string, number>()
  const lengthOf = (mark: Mark): number => {
    const known = lengths.get(mark.id)
    if (known !== undefined) return known
    const children = groups.get(mark.id) ?? []
    const length = Math.max(
      frameMs,
      children.reduce((sum, child) => sum + lengthOf(child), 0),
    )
    lengths.set(mark.id, length)
    return length
  }
  for (const group of groups.values()) for (const mark of group) lengthOf(mark)
  return lengths
}

type Placement = {
  groups: Siblings
  lengths: Map<string, number>
  frameMs: FrameMs
  changed: Mark[]
}

/**
 * Snaps the siblings inside the range from `fromMs` to `toMs`, in time order, then their children inside each new range.
 * Each mark starts at or after the end of the mark before it, and leaves room for the shortest lengths of the marks after it.
 */
function place(placement: Placement, siblings: readonly Mark[], fromMs: number, toMs: number) {
  const { groups, lengths, frameMs, changed } = placement
  const minimums = siblings.map((mark) => lengths.get(mark.id) ?? frameMs)
  let roomAfter = minimums.reduce((sum, length) => sum + length, 0)
  let previousEndMs = fromMs
  siblings.forEach((mark, index) => {
    const minimum = minimums[index] ?? frameMs
    roomAfter -= minimum
    const latestEndMs = toMs - roomAfter
    const startMs = Math.max(
      previousEndMs,
      Math.min(snap(mark.startMs, frameMs), latestEndMs - minimum),
    )
    const endMs = Math.max(startMs + minimum, Math.min(snap(mark.endMs, frameMs), latestEndMs))
    if (startMs !== mark.startMs || endMs !== mark.endMs) changed.push({ ...mark, startMs, endMs })
    place(placement, groups.get(mark.id) ?? [], startMs, endMs)
    previousEndMs = endMs
  })
}

/**
 * Returns the edit that moves the start and the end of each mark to the nearest multiple of `frameMs`, for a frame size change.
 * The result keeps these rules:
 * - No two marks on one layer of one voice overlap.
 * - Each mark is one frame size or longer. A word with more phonemes than frame sizes gets longer.
 * - Each word stays inside its phrase, and each phoneme stays inside its word.
 * - A phrase stops at the last multiple of the frame size in the song.
 *
 * A mark that a rule moves pushes the marks after it later. Its flags `edited` and `estimated` do not change,
 * because the person did not change the mark by hand.
 * If the song is too short for the shortest lengths of all marks, the last marks end after the song.
 * @param marks All marks of the song.
 * @param frameMs The new frame size.
 * @param durationMs The duration of the song in milliseconds.
 */
export function previewFrameSize(
  marks: readonly Mark[],
  frameMs: FrameMs,
  durationMs: number,
): MarkEdit {
  const groups = groupSiblings(marks)
  const placement: Placement = {
    groups,
    lengths: minimumLengths(groups, frameMs),
    frameMs,
    changed: [],
  }
  const lastFrameMs = Math.floor(durationMs / frameMs) * frameMs
  for (const [key, siblings] of groups)
    if (key.startsWith('top:')) place(placement, siblings, 0, lastFrameMs)
  return { changed: placement.changed, removedIds: [] }
}
