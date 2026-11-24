import { findMark } from '../../lib/marks/family.ts'
import { moveLimits } from '../../lib/marks/limits.ts'
import { previewMove } from '../../lib/marks/moveRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Moves a mark of the open song by `deltaMs`, as one undo step. The rules are those of `previewMove`.
 * An amount past a limit moves the mark to the limit. A call that changes nothing records no step.
 * @param id The id of the mark. An unknown id changes nothing.
 * @param deltaMs The amount to move, in milliseconds. A negative amount moves the mark earlier.
 */
export function moveMark(id: string, deltaMs: number): void {
  useSongStore
    .getState()
    .apply((content) =>
      commitMarkEdit(
        content,
        previewMove(content.marks, id, deltaMs, content.song.frameMs, content.song.durationMs),
      ),
    )
}

/**
 * Returns true when the mark of the open song can move earlier or later by one frame size or more.
 * Returns false when no song is open or no mark has the id.
 * @param id The id of the mark.
 */
export function canMoveMark(id: string): boolean {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  if (!content || !mark) return false
  const limits = moveLimits(content.marks, mark, content.song.frameMs, content.song.durationMs)
  return limits.minDeltaMs < 0 || limits.maxDeltaMs > 0
}
