import { singerVoiceRanges } from '../lib/singers/singerRanges.ts'
import type { TimeRange } from '../lib/time/timeRange.ts'
import type { KeptTracks, Mark, RunData, Voice } from './types.ts'

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

function phraseRanges(marks: readonly Mark[], voiceId: string, range: TimeRange): TimeRange[] {
  return marks.filter(
    (mark) =>
      mark.layer === 'phrase' &&
      mark.voiceId === voiceId &&
      mark.endMs > range.startMs &&
      mark.startMs < range.endMs,
  )
}

/** Returns one row for each voice of a singer run that has singer ranges, in the voice order of the run report. */
function singerRows(data: RunData, voices: readonly Voice[], marks: readonly Mark[]): TrackRow[] {
  if (!SPLIT_STATUSES.has(data.report.singers.status)) return []
  // The run report keeps the voice names, so a renamed or deleted voice gets no row.
  const runVoices = data.report.voices.flatMap(
    ({ name }) => voices.find((voice) => voice.name === name) ?? [],
  )
  const ranges = singerVoiceRanges(
    data.singerSegments,
    runVoices.map((voice) => ({
      voiceId: voice.id,
      phrases: phraseRanges(marks, voice.id, data.report.range),
    })),
  )
  return runVoices.flatMap((voice) => {
    const gate = ranges.get(voice.id)
    return gate === undefined
      ? []
      : [
          {
            id: `singer:${voice.id}`,
            name: voice.name,
            track: 'vocals' as const,
            gate,
            color: voice.color,
          },
        ]
  })
}

/**
 * Returns the track rows of a song, from top to bottom: "Vocals", "Instruments", then one row for each singer voice.
 * A song with no kept audio tracks has no row.
 * @param data The run data of the song, or null or undefined when the editor has none.
 * @param voices The voices of the song.
 * @param marks The marks of the song. The phrases of each singer voice decide the voice of each singer.
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
