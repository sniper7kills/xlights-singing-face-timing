import { PHONEME_LABELS, type PhonemeLabel } from '../lib/dictionary/cmuSymbols.ts'
import type { SongStoreState } from './songStore.ts'
import type { Mark, Voice } from './types.ts'

const NO_MARKS: Mark[] = []

/**
 * Returns the label of the phoneme of one voice at a time, for the face preview.
 * A phoneme covers its start time and ends before its end time, so two adjacent phonemes never both match.
 * @param marks The marks of the open song.
 * @param voiceId The voice to read. Undefined is for a song with no voice.
 * @param timeMs The time, usually the play time.
 * Returns null when no phoneme of the voice is at the time, or when its label is not one of the ten phoneme labels.
 * The face preview shows the closed mouth for null, the same as xLights for a gap.
 */
export function phonemeLabelAt(
  marks: readonly Mark[],
  voiceId: string | undefined,
  timeMs: number,
): PhonemeLabel | null {
  const phoneme = marks.find(
    (mark) =>
      mark.layer === 'phoneme' &&
      mark.voiceId === voiceId &&
      mark.startMs <= timeMs &&
      timeMs < mark.endMs,
  )
  return PHONEME_LABELS.find((label) => label === phoneme?.label) ?? null
}

/**
 * Returns a song store selector that gives the unknown words of one voice, in time order.
 * An unknown word is a word mark with `unknown: true`.
 * @param voiceId The voice to read. Undefined is for a song with no voice.
 * The selector gives an empty list when no song is open or `voiceId` is undefined.
 * It gives a new array for each call, so a component must compare the result with `useShallow`.
 */
export function unknownWords(voiceId: string | undefined): (state: SongStoreState) => Mark[] {
  return (state) => {
    if (state.current === null || voiceId === undefined) return NO_MARKS
    return state.current.marks
      .filter((mark) => mark.voiceId === voiceId && mark.layer === 'word' && mark.unknown === true)
      .sort((a, b) => a.startMs - b.startMs)
  }
}

/**
 * Returns the unknown word that the unknown-word counter selects next.
 * @param words The unknown words of the voice, in time order.
 * @param selectedMarkIds The selected marks of the view store.
 * @param playTimeMs The play time.
 * If one of the words is the only selected mark, the result is the word after it.
 * Otherwise the result is the first word that starts at or after the play time.
 * After the last word, the result is the first word again.
 * Returns undefined when `words` is empty.
 */
export function nextUnknownWord(
  words: readonly Mark[],
  selectedMarkIds: readonly string[],
  playTimeMs: number,
): Mark | undefined {
  const selected =
    selectedMarkIds.length === 1 ? words.findIndex((word) => word.id === selectedMarkIds[0]) : -1
  if (selected >= 0) return words[(selected + 1) % words.length]
  return words.find((word) => word.startMs >= playTimeMs) ?? words[0]
}

/**
 * Returns the selected mark if it is the only selected mark and an unknown word.
 * @param marks The marks of the open song.
 * @param selectedMarkIds The selected marks of the view store.
 * Returns undefined for no selection, for more than one selected mark, and for any other mark.
 */
export function selectedUnknownWord(
  marks: readonly Mark[],
  selectedMarkIds: readonly string[],
): Mark | undefined {
  if (selectedMarkIds.length !== 1) return undefined
  const mark = marks.find((candidate) => candidate.id === selectedMarkIds[0])
  return mark?.layer === 'word' && mark.unknown === true ? mark : undefined
}

/** One phrase of another voice on the ghost row. */
export type GhostBar = {
  /** The id of the phrase. */
  id: string
  voiceId: string
  voiceName: string
  color: string
  label: string
  startMs: number
  endMs: number
  /** The row of the bar: the index of its voice among the other voices that have a phrase, in voice order. */
  lane: number
}

/**
 * Returns the bars of the ghost row: one bar for each phrase of each voice that the layers do not show.
 * The bars are in time order. Words and phonemes get no bar.
 * @param voices The voices of the open song, in voice order.
 * @param marks The marks of the open song.
 * @param shownVoiceId The voice that the layers show. Undefined is for a song with no voice.
 */
export function ghostBars(
  voices: readonly Voice[],
  marks: readonly Mark[],
  shownVoiceId: string | undefined,
): GhostBar[] {
  const phrases = marks.filter((mark) => mark.layer === 'phrase' && mark.voiceId !== shownVoiceId)
  const withPhrase = voices.filter((voice) => phrases.some((mark) => mark.voiceId === voice.id))
  const lanes = new Map(withPhrase.map((voice, lane) => [voice.id, { voice, lane }]))
  return phrases
    .flatMap((mark) => {
      const entry = lanes.get(mark.voiceId)
      if (entry === undefined) return []
      const { voice, lane } = entry
      const { id, voiceId, label, startMs, endMs } = mark
      return [
        { id, voiceId, voiceName: voice.name, color: voice.color, label, startMs, endMs, lane },
      ]
    })
    .sort((a, b) => a.startMs - b.startMs || a.lane - b.lane)
}

/** The most faces that the face preview shows. */
export const MAX_FACES = 4

/**
 * Returns the voices that the face preview shows: the first 4 voices that are not muted, in voice order.
 * @param voices The voices of the open song, in voice order.
 * `moreCount` is the count of the other voices that are not muted. The preview shows it as "+2 more".
 */
export function previewVoices(voices: readonly Voice[]): { shown: Voice[]; moreCount: number } {
  const unmuted = voices.filter((voice) => voice.previewMuted !== true)
  return { shown: unmuted.slice(0, MAX_FACES), moreCount: Math.max(0, unmuted.length - MAX_FACES) }
}
