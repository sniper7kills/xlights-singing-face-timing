import { applyEdit } from '../../lib/marks/markEdit.ts'
import { overlapsRange, previewRangeClear } from '../../lib/marks/rangeRules.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { numbered } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { newMarkId } from './commitMarkEdit.ts'

/**
 * Returns the count of marks of the voice that overlap the range, on all layers.
 * A transcribe run over the range removes or shortens these marks. The replace question states the count.
 * @param marks The marks of the song.
 * @param voiceId The voice to read.
 * @param range The target range of the run.
 */
export function countMarksInRange(
  marks: readonly Mark[],
  voiceId: string,
  range: TimeRange,
): number {
  return marks.filter((mark) => mark.voiceId === voiceId && overlapsRange(mark, range)).length
}

/**
 * Returns true when the voice has one or more marks that overlap the range.
 * A transcribe run over the range removes or shortens these marks, so the run asks the person first.
 * The rule is the rule of `countMarksInRange`, so the question and its count agree.
 * @param content The open song.
 * @param voiceId The voice to read.
 * @param range The target range of the run.
 */
export function hasMarksInRange(content: SongContent, voiceId: string, range: TimeRange): boolean {
  return countMarksInRange(content.marks, voiceId, range) > 0
}

/**
 * Returns the marks with the range of each voice cleared by `previewRangeClear`.
 * @param marks The marks of the song.
 * @param voiceIds The voices to clear.
 * @param range The target range of the run.
 */
function clearedMarks(marks: Mark[], voiceIds: readonly string[], range: TimeRange): Mark[] {
  return voiceIds.reduce(
    (result, voiceId) => applyEdit(result, previewRangeClear(result, voiceId, range, newMarkId)),
    marks,
  )
}

/**
 * Returns the content with the range of each voice cleared, the emptied voices removed, and the new marks added.
 * Returns the input when no mark and no voice changes, so the store records no step.
 */
function replaceStep(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
  singerVoiceIds: readonly string[],
): SongContent {
  const singers = singerVoiceIds.filter(
    (id) => id !== voiceId && content.voices.some((voice) => voice.id === id),
  )
  const marks = [...clearedMarks(content.marks, [...singers, voiceId], range), ...newMarks]
  // A singer voice with no mark left goes, so the singer step of the run can use its name again.
  const emptied = new Set(singers.filter((id) => !marks.some((mark) => mark.voiceId === id)))
  const unchanged =
    emptied.size === 0 &&
    marks.length === content.marks.length &&
    marks.every((mark, index) => mark === content.marks[index])
  if (unchanged) return content
  const voices =
    emptied.size === 0
      ? content.voices
      : numbered(content.voices.filter((voice) => !emptied.has(voice.id)))
  return { ...content, voices, marks }
}

/**
 * Replaces the marks of the voice in the range with new marks, as one undo step.
 * A word that overlaps the range goes with its phonemes. A phrase that overlaps the range keeps its words outside the range.
 * See `previewRangeClear` for the full rules.
 * With `singerVoiceIds`, the same step clears the range on each of those voices by the same rules,
 * and removes each of those voices that has no mark left. The other voices get `order` 0, 1, 2 again.
 * The marks of other voices do not change.
 * @param voiceId The voice that receives the marks.
 * @param range The target range. For a full-song run, the range is the full song.
 * @param newMarks The marks that the run creates, inside the range, with their phrase, word and phoneme parents set.
 * @param singerVoiceIds The singer voices of the last run that the run replaces. An unknown id and the id of `voiceId` change nothing.
 * Returns false when the open song has no voice with the id. The marks then do not change and the store records no step.
 */
export function replaceMarksInRange(
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
  singerVoiceIds: readonly string[] = [],
): boolean {
  let voiceExists = false
  useSongStore.getState().apply((content) => {
    voiceExists = content.voices.some((voice) => voice.id === voiceId)
    return voiceExists ? replaceStep(content, voiceId, range, newMarks, singerVoiceIds) : content
  })
  return voiceExists
}
