import { MAX_VOICES } from '../voices/voiceRules.ts'

/**
 * The mode of the singer split:
 * - `male-female`: one track for the female voice and one track for the male voice.
 * - `lead-backing`: one track for the lead singer and one track for the backing singers.
 */
export type SplitMode = 'male-female' | 'lead-backing'

/** The label of one singer track. Each mode gives two labels. */
export type SingerTrackLabel = 'female' | 'male' | 'lead' | 'backing'

/** The two labels of each mode, in the order of the new voices. */
export const SPLIT_LABELS: Readonly<
  Record<SplitMode, readonly [SingerTrackLabel, SingerTrackLabel]>
> = {
  'male-female': ['female', 'male'],
  'lead-backing': ['lead', 'backing'],
}

/** The name of the voice of each singer track label. */
export const SPLIT_VOICE_NAME: Readonly<Record<SingerTrackLabel, string>> = {
  female: 'Female',
  male: 'Male',
  lead: 'Lead',
  backing: 'Backing',
}

/** The text of each mode in the transcribe dialog and in the run report. */
export const SPLIT_MODE_TEXT: Readonly<Record<SplitMode, string>> = {
  'male-female': 'Male and female',
  'lead-backing': 'Lead and backing',
}

/** The count of voices that a singer split adds. */
export const SPLIT_VOICE_COUNT = 2

/** Returns true when the value is a mode of the singer split. Stored settings can hold an old or a wrong value. */
export function isSplitMode(value: unknown): value is SplitMode {
  return value === 'male-female' || value === 'lead-backing'
}

/**
 * Returns the tracks in the label order of the mode, or null when the labels do not match the mode.
 * An engine can return the tracks in any order, so the voices always get the same order.
 * @param mode The mode of the run.
 * @param tracks The tracks that the engine returned.
 */
export function orderedTracks<T extends { label: SingerTrackLabel }>(
  mode: SplitMode,
  tracks: readonly T[],
): [T, T] | null {
  const [first, second] = SPLIT_LABELS[mode].map((label) =>
    tracks.find((track) => track.label === label),
  )
  return first === undefined || second === undefined || tracks.length !== SPLIT_VOICE_COUNT
    ? null
    : [first, second]
}

/**
 * Returns true when the song has room for the two voices of a singer split.
 * @param voiceCount The count of voices of the song before the run.
 * @param freedCount The count of voices that the run removes first: the voices of the last run that its clear empties.
 */
export function hasRoomForSplit(voiceCount: number, freedCount: number): boolean {
  return voiceCount - freedCount + SPLIT_VOICE_COUNT <= MAX_VOICES
}

/** Returns the mean of the two channels, one sample for each sample of the left channel. */
export function mixToMono(audio: { left: Float32Array; right: Float32Array }): Float32Array {
  return audio.left.map((left, index) => (left + (audio.right[index] ?? left)) / 2)
}

/**
 * Returns the samples with the parts outside `[startShare, endShare)` of the length set to 0.
 * The fixture engine gives two singer tracks that each keep one part of the vocals, with a part in common.
 * @param samples One channel.
 * @param startShare The start of the part to keep, from 0 to 1 of the length.
 * @param endShare The end of the part to keep, from 0 to 1 of the length.
 */
export function keepPart(
  samples: Float32Array,
  startShare: number,
  endShare: number,
): Float32Array {
  const start = Math.round(samples.length * startShare)
  const end = Math.round(samples.length * endShare)
  return samples.map((value, index) => (index >= start && index < end ? value : 0))
}
