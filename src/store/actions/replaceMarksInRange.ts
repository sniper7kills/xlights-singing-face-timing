import type { TimeRange } from '../../lib/time/timeRange.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'

function isFullyInside(mark: Mark, voiceId: string, range: TimeRange): boolean {
  return mark.voiceId === voiceId && mark.startMs >= range.startMs && mark.endMs <= range.endMs
}

/**
 * Returns true when the voice has one or more marks that lie fully inside the range.
 * A transcribe run over the range replaces these marks.
 * @param content The open song.
 * @param voiceId The voice to read.
 * @param range The target range of the run.
 */
export function hasMarksInRange(content: SongContent, voiceId: string, range: TimeRange): boolean {
  return content.marks.some((mark) => isFullyInside(mark, voiceId, range))
}

/**
 * Returns the content with the marks of the voice in the range replaced by `newMarks`.
 * The step also removes the children of each removed mark, so no mark has a missing parent.
 * Returns the input when no mark goes and no mark comes, so the store records no step.
 */
function replaceStep(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
): SongContent {
  const removed = new Set(
    content.marks.filter((mark) => isFullyInside(mark, voiceId, range)).map((mark) => mark.id),
  )
  if (removed.size === 0 && newMarks.length === 0) return content
  // Marks are in no fixed order, so the loop repeats until no new child goes.
  let size = -1
  while (size !== removed.size) {
    size = removed.size
    for (const mark of content.marks)
      if (mark.parentId !== null && removed.has(mark.parentId)) removed.add(mark.id)
  }
  return {
    ...content,
    marks: [...content.marks.filter((mark) => !removed.has(mark.id)), ...newMarks],
  }
}

/**
 * Replaces the marks of the voice that lie fully inside the range with new marks, as one undo step.
 * The marks of the voice outside the range and the marks of other voices stay unchanged.
 * @param voiceId The voice that receives the marks.
 * @param range The target range. For a full-song run, the range is the full song.
 * @param newMarks The marks that the run creates, with their phrase, word and phoneme parents set.
 */
export function replaceMarksInRange(voiceId: string, range: TimeRange, newMarks: Mark[]): void {
  useSongStore.getState().apply((content) => replaceStep(content, voiceId, range, newMarks))
}
