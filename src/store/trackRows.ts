import { phraseRangesOf, rangesOfSingers, singerVoiceRanges } from '../lib/singers/singerRanges.ts'
import type { TimeRange } from '../lib/time/timeRange.ts'
import type { KeptTracks, Mark, RunData, RunVoice, Voice } from './types.ts'

/** One track row of the editor: an audio track, or the vocals in the time ranges of one singer. */
export type TrackRow = {
  /** `vocals`, `instruments`, or `singer:<voice id>`. */
  id: string
  /** The row name. The names of the controls end with it. */
  name: string
  /** The kept audio track that the row shows and plays. */
  track: keyof KeptTracks
  /** The time ranges that the row shows and plays, or null for all of the track. */
  gate: TimeRange[] | null
  /** The colour of the voice of a singer row, or null for the colour of the waveform. */
  color: string | null
}

/** The singer step put the singers on voices only with these results. */
const SPLIT_STATUSES = new Set(['split', 'capped'])

function singerRow(voice: Voice, gate: TimeRange[]): TrackRow {
  return { id: `singer:${voice.id}`, name: voice.name, track: 'vocals', gate, color: voice.color }
}

/**
 * Returns the singer rows of a record from before issue #173, which has no voice ids.
 * The run report keeps the voice names, so a renamed or deleted voice gets no row.
 */
function rowsByName(data: RunData, voices: readonly Voice[], marks: readonly Mark[]): TrackRow[] {
  const runVoices = data.report.voices.flatMap(
    ({ name }) => voices.find((voice) => voice.name === name) ?? [],
  )
  const ranges = singerVoiceRanges(
    data.singerSegments,
    runVoices.map((voice) => ({
      voiceId: voice.id,
      phrases: phraseRangesOf(marks, voice.id, data.report.range),
    })),
  )
  return runVoices.flatMap((voice) => {
    const gate = ranges.get(voice.id)
    return gate === undefined ? [] : [singerRow(voice, gate)]
  })
}

/**
 * Returns the singer rows of a record with voice ids, in the present voice order.
 * The singers of each voice are fixed at the end of the run, so a deleted voice takes its ranges with it.
 */
function rowsById(data: RunData, runVoices: readonly RunVoice[], voices: readonly Voice[]) {
  return voices.flatMap((voice) => {
    const singers = runVoices.find((runVoice) => runVoice.voiceId === voice.id)?.singers ?? []
    const gate = rangesOfSingers(data.singerSegments, singers)
    return gate.length === 0 ? [] : [singerRow(voice, gate)]
  })
}

/** Returns one row for each voice of a singer run that has singer ranges. */
function singerRows(data: RunData, voices: readonly Voice[], marks: readonly Mark[]): TrackRow[] {
  if (!SPLIT_STATUSES.has(data.report.singers.status)) return []
  return data.voices === undefined
    ? rowsByName(data, voices, marks)
    : rowsById(data, data.voices, voices)
}

/**
 * Returns the track rows of a song, from top to bottom: "Vocals", "Instruments", then one row for each singer voice.
 * A song with no kept audio tracks has no row.
 * @param data The run data of the song, or null or undefined when the editor has none.
 * @param voices The voices of the song. A singer row has the present name and colour of its voice.
 * @param marks The marks of the song. For a record with no voice ids, the phrases of each voice decide the voice of each singer.
 */
export function trackRows(
  data: RunData | null | undefined,
  voices: readonly Voice[],
  marks: readonly Mark[],
): TrackRow[] {
  if (data?.tracks === undefined) return []
  return [
    { id: 'vocals', name: 'Vocals', track: 'vocals', gate: null, color: null },
    { id: 'instruments', name: 'Instruments', track: 'instruments', gate: null, color: null },
    ...singerRows(data, voices, marks),
  ]
}

/** One voice that the last run wrote marks to, and that still exists. */
export type LastRunVoice = {
  voice: Voice
  /** True for a voice that the singer step of the last run added. Only such a voice goes when a new run empties it. */
  made: boolean
}

/**
 * Returns the voices that the last run wrote marks to and that still exist: the voice of the last run and its singer voices.
 * A voice that the person renamed is still such a voice.
 * @param data The stored run data of the song, or undefined when the song has none.
 * @param voices The voices of the song, in their order. The result keeps this order.
 * @param runVoiceId The voice of the new run. It is never in the result.
 * A record from before issue #173 has no voice ids, so the function finds the voices by the names in the report.
 */
export function lastRunVoices(
  data: RunData | undefined,
  voices: readonly Voice[],
  runVoiceId: string,
): LastRunVoice[] {
  if (data === undefined) return []
  const entryOf = (voice: Voice) =>
    data.voices === undefined
      ? data.report.voices.find((entry) => entry.name === voice.name)
      : data.voices.find((entry) => entry.voiceId === voice.id)
  return voices.flatMap((voice) => {
    const entry = voice.id === runVoiceId ? undefined : entryOf(voice)
    return entry === undefined ? [] : [{ voice, made: entry.made === true }]
  })
}
