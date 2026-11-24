import { applyEdit, isEmptyEdit } from '../../lib/marks/markEdit.ts'
import { overlapsRange, previewRangeClear } from '../../lib/marks/rangeRules.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { newMarkId } from './commitMarkEdit.ts'

/**
 * Returns true when the voice has one or more marks that overlap the range.
 * A transcribe run over the range removes or shortens these marks, so the run asks the person first.
 * @param content The open song.
 * @param voiceId The voice to read.
 * @param range The target range of the run.
 */
export function hasMarksInRange(content: SongContent, voiceId: string, range: TimeRange): boolean {
  return content.marks.some((mark) => mark.voiceId === voiceId && overlapsRange(mark, range))
}

/**
 * Returns the content with the range of the voice cleared by `previewRangeClear` and the new marks added.
 * Returns the input when no mark changes, no mark goes and no mark comes, so the store records no step.
 */
function replaceStep(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
): SongContent {
  const cleared = previewRangeClear(content.marks, voiceId, range, newMarkId)
  const edit = { ...cleared, added: [...(cleared.added ?? []), ...newMarks] }
  if (isEmptyEdit(edit)) return content
  return { ...content, marks: applyEdit(content.marks, edit) }
}

/**
 * Replaces the marks of the voice in the range with new marks, as one undo step.
 * A word that overlaps the range goes with its phonemes. A phrase that overlaps the range keeps its words outside the range.
 * See `previewRangeClear` for the full rules. The marks of other voices do not change.
 * @param voiceId The voice that receives the marks.
 * @param range The target range. For a full-song run, the range is the full song.
 * @param newMarks The marks that the run creates, inside the range, with their phrase, word and phoneme parents set.
 */
export function replaceMarksInRange(voiceId: string, range: TimeRange, newMarks: Mark[]): void {
  useSongStore.getState().apply((content) => replaceStep(content, voiceId, range, newMarks))
}
