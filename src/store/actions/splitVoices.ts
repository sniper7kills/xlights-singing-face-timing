import type { TimeRange } from '../../lib/time/timeRange.ts'
import { nextVoiceName, voiceNameError } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent, Voice } from '../types.ts'
import { type ReplacedVoice, replaceStep } from './replaceMarksInRange.ts'
import { addVoiceStep } from './voices.ts'

/** The marks of one singer track of a run, and the name of its new voice. */
export type SplitTrackMarks = {
  /** The name of the new voice, for example "Female". */
  name: string
  /** The marks of the track. The action gives each mark the id of the new voice. */
  marks: readonly Mark[]
}

/** Returns the name if no voice has it, else the name with the lowest free number, for example "Female 2". */
function freeName(voices: readonly Voice[], name: string): string {
  return voiceNameError(voices, null, name) === null ? name : nextVoiceName(voices, name)
}

/**
 * Returns the content with one new voice and the marks of each track that has a word, or null when the song has no room.
 * The id of a track with no word is null, because the track makes no voice.
 */
function withTrackVoices(content: SongContent, tracks: readonly SplitTrackMarks[]) {
  let next = content
  const voiceIds: (string | null)[] = []
  for (const track of tracks) {
    if (!track.marks.some((mark) => mark.layer === 'word')) {
      voiceIds.push(null)
      continue
    }
    const added = addVoiceStep(next, freeName(next.voices, track.name))
    if (added === null) return null
    const voiceId = added.voice.id
    const marks = track.marks.map((mark) => ({ ...mark, voiceId }))
    next = { ...added.content, marks: [...added.content.marks, ...marks] }
    voiceIds.push(voiceId)
  }
  return { content: next, voiceIds }
}

/**
 * Writes the result of a run with the singer split, as one undo step.
 *
 * The rules:
 * - The step clears the range on the voice of the run and on each voice of `replacedVoices`, as `replaceMarksInRange` does.
 * - It removes each removable voice from which it removed the last mark.
 * - Then it adds one voice for each track that has a word, with the next unused colour, and puts the marks of the track on it.
 *   A track with no word makes no voice.
 * - A voice gets the name of its track. When another voice has the name, it gets the lowest free number, for example "Female 2".
 *
 * @param voiceId The voice of the run.
 * @param range The target range of the run.
 * @param tracks The marks of each singer track, in voice order.
 * @param replacedVoices The voices of the last run that the run replaces.
 * Returns the id of the new voice of each track, null for a track with no word,
 * or null when the voice of the run does not exist or the song has no room for each new voice.
 * The song then does not change and the store records no step.
 */
export function writeSplitRun(
  voiceId: string,
  range: TimeRange,
  tracks: readonly SplitTrackMarks[],
  replacedVoices: readonly ReplacedVoice[],
): (string | null)[] | null {
  let voiceIds: (string | null)[] | null = null
  useSongStore.getState().apply((content) => {
    if (!content.voices.some((voice) => voice.id === voiceId)) return content
    const cleared = replaceStep(content, voiceId, range, [], replacedVoices)
    const added = withTrackVoices(cleared, tracks)
    if (added === null) return content
    voiceIds = added.voiceIds
    return added.content
  })
  return voiceIds
}
