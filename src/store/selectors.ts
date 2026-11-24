import { PHONEME_LABELS, type PhonemeLabel } from '../lib/dictionary/cmuSymbols.ts'
import type { SongStoreState } from './songStore.ts'
import type { Mark } from './types.ts'

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
