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

/** A voice that a transcribe run clears in its range. */
export type ReplacedVoice = {
  voiceId: string
  /**
   * True for a voice that the last run made: a singer voice or a voice of a singer split.
   * It goes when this step removes its last mark. The voice of the run goes by this rule too.
   */
  removable: boolean
}

const hasMarks = (marks: readonly Mark[], voiceId: string) =>
  marks.some((mark) => mark.voiceId === voiceId)

/**
 * Returns the ids of the removable voices that had marks before the step and have none after it.
 * A voice that had no mark before the step stays, because the person can keep an empty voice on purpose.
 */
function emptiedVoiceIds(
  replaced: readonly ReplacedVoice[],
  before: readonly Mark[],
  after: readonly Mark[],
): Set<string> {
  return new Set(
    replaced
      .filter(
        ({ voiceId, removable }) =>
          removable && hasMarks(before, voiceId) && !hasMarks(after, voiceId),
      )
      .map(({ voiceId }) => voiceId),
  )
}

/** Returns the marks after the step and the ids of the voices that the step removes. See `replaceStep`. */
function replacePlan(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
  replacedVoices: readonly ReplacedVoice[],
): { marks: Mark[]; emptied: Set<string> } {
  const known = replacedVoices.filter((item) =>
    content.voices.some((voice) => voice.id === item.voiceId),
  )
  const cleared = [
    ...known.filter((item) => item.voiceId !== voiceId).map((item) => item.voiceId),
    voiceId,
  ]
  const marks = [...clearedMarks(content.marks, cleared, range), ...newMarks]
  // A voice of the last run that this step empties goes, so the run can use its name again.
  return { marks, emptied: emptiedVoiceIds(known, content.marks, marks) }
}

/**
 * Returns the count of voices that a step with no new marks removes: the removable voices that the clear of the range empties.
 * A run with the singer split writes no mark on the voices that it clears, so the count is the count of voices that it frees.
 * The room check before the run and the write after it use this one rule, so they cannot disagree.
 * @param content The open song.
 * @param voiceId The voice of the run.
 * @param range The target range of the run.
 * @param replacedVoices The voices of the last run that the run replaces.
 */
export function freedVoiceCount(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  replacedVoices: readonly ReplacedVoice[],
): number {
  return replacePlan(content, voiceId, range, [], replacedVoices).emptied.size
}

/**
 * Returns the content with the range of each voice cleared, the emptied voices of the last run removed, and the new marks added.
 * Returns the input when no mark and no voice changes, so the store records no step.
 */
export function replaceStep(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
  replacedVoices: readonly ReplacedVoice[],
): SongContent {
  const { marks, emptied } = replacePlan(content, voiceId, range, newMarks, replacedVoices)
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
 * With `replacedVoices`, the same step clears the range on each of those voices by the same rules.
 * It removes each removable voice from which the step removed its last mark. The voice of the run goes by this rule too,
 * when `replacedVoices` holds it as removable and the step writes no mark on it. The other voices get `order` 0, 1, 2 again.
 * The marks of other voices do not change.
 * @param voiceId The voice that receives the marks.
 * @param range The target range. For a full-song run, the range is the full song.
 * @param newMarks The marks that the run creates, inside the range, with their phrase, word and phoneme parents set.
 * @param replacedVoices The voices of the last run that the run replaces. An unknown id changes nothing.
 * Returns false when the open song has no voice with the id. The marks then do not change and the store records no step.
 */
export function replaceMarksInRange(
  voiceId: string,
  range: TimeRange,
  newMarks: Mark[],
  replacedVoices: readonly ReplacedVoice[] = [],
): boolean {
  let voiceExists = false
  useSongStore.getState().apply((content) => {
    voiceExists = content.voices.some((voice) => voice.id === voiceId)
    return voiceExists ? replaceStep(content, voiceId, range, newMarks, replacedVoices) : content
  })
  return voiceExists
}
