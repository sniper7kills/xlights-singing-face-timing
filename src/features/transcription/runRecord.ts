import { floatToPcm16, KEPT_TRACK_SAMPLE_RATE, type PcmTrack } from '../../lib/audio/pcm.ts'
import { SINGER_SHARE } from '../../lib/singers/assignSingers.ts'
import type { SingerDiagnostics } from '../../lib/singers/diagnostics.ts'
import {
  buildRunReport,
  createStepClock,
  type ReportSeparationModel,
  type ReportSingerRange,
  type RunNote,
  type RunStep,
  type SingerSection,
  type StepClock,
  voicePhrases,
} from '../../lib/runReport/runReport.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { endpointHost } from '../../lib/remote/endpoint.ts'
import { saveRunData, StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { KeptTracks, Mark, RunData } from '../../store/types.ts'
import type { SeparatedAudio } from '../vocal-separation/protocol.ts'
import { SeparateError } from '../vocal-separation/separateClient.ts'
import { resampleSeparated } from '../vocal-separation/separationAudio.ts'
import type { RunStage, SingerOutcome, TranscribeRequest } from './runTranscription.ts'

/**
 * The facts that a run collects for its report and its run data.
 * The run changes the fields while it goes, and `finishRunRecord` reads them at the end.
 */
export type RunRecord = {
  startedAt: string
  clock: StepClock
  separationModel: ReportSeparationModel
  separationFallback: boolean
  /** The count of audio tracks that the vocal separation gave. */
  trackCount: number
  /** The audio tracks to store, or null when the run keeps none. */
  tracks: KeptTracks | null
  notes: RunNote[]
  /** The singer ranges with song times, or null when the singer search returned none. */
  singerSegments: ReportSingerRange[] | null
  singerDiagnostics: SingerDiagnostics | null
  /** The counts of the assignment of the phrases to the singers, or null before it. */
  assignment: Pick<
    SingerSection,
    'singersWithPhrases' | 'phrasesWithNoSinger' | 'phrasesWithMoreSingers'
  > | null
  singers: SingerOutcome | null
  /** The ids of the voices that the singer step added. */
  singerVoiceIds: string[]
}

/** Returns the record of a run at its start. */
export function startRunRecord(now: Date = new Date()): RunRecord {
  return {
    startedAt: now.toISOString(),
    clock: createStepClock(() => performance.now()),
    separationModel: 'none',
    separationFallback: false,
    trackCount: 0,
    tracks: null,
    notes: [],
    singerSegments: null,
    singerDiagnostics: null,
    assignment: null,
    singers: null,
    singerVoiceIds: [],
  }
}

/** The report step of each run stage. */
export const STAGE_STEP: Record<RunStage, RunStep> = {
  preparing: 'prepare',
  'separation-download': 'separationDownload',
  separating: 'separation',
  loading: 'modelLoad',
  transcribing: 'transcribe',
  sending: 'upload',
  waiting: 'wait',
  'singers-download': 'singersDownload',
  'finding-singers': 'singers',
}

/**
 * Returns the two audio tracks of a separation to store: 16-bit PCM at `KEPT_TRACK_SAMPLE_RATE`, or null with no instruments.
 * @param separated The vocals and the instruments at 44 100 Hz.
 * @param startMs The song time of the first sample. A range run gives the start of the range.
 * Rejects when the browser cannot resample the audio.
 */
export async function tracksToKeep(
  separated: SeparatedAudio,
  startMs: number,
): Promise<KeptTracks | null> {
  const { instruments } = separated
  if (instruments === undefined) return null
  const track = async (samples: Float32Array): Promise<PcmTrack> => ({
    startMs,
    sampleRate: KEPT_TRACK_SAMPLE_RATE,
    samples: floatToPcm16(await resampleSeparated(samples, KEPT_TRACK_SAMPLE_RATE)),
  })
  return { vocals: await track(separated.vocals), instruments: await track(instruments) }
}

/** The report line of a run whose audio tracks the browser storage could not keep. */
export const STORAGE_FULL_NOTE: RunNote = {
  step: 'storage',
  kind: 'storage-full',
  text: 'audio tracks not kept: the browser storage is full',
}

/** The report line of a run whose audio tracks the browser could not convert for storage. */
export const TRACKS_FAILED_NOTE: RunNote = {
  step: 'storage',
  kind: 'unknown',
  text: 'audio tracks not kept: the app could not convert the tracks',
}

/**
 * Returns the report line of a failed vocal separation that the run continued after.
 * @param error The failure of the separation.
 * @param fastModel True when the person selected "Use the fast model", false for "Continue with no separation".
 */
export function separationFailureNote(error: unknown, fastModel: boolean): RunNote {
  const kind = error instanceof SeparateError ? error.kind : 'unknown'
  const next = fastModel ? 'continued with the fast model' : 'continued with no separation'
  return { step: 'separation', kind, text: `separation failed: ${kind}; ${next}` }
}

/** Returns the report line of a singer step that stopped, or null for a step that completed. */
export function singerNote(singers: SingerOutcome): RunNote | null {
  switch (singers.status) {
    case 'capped':
      return { step: 'singers', kind: 'capped', text: 'singers: more singers than free voices' }
    case 'cancelled':
      return { step: 'singers', kind: 'cancelled', text: 'singers: the person cancelled the step' }
    case 'no-vocals':
      return { step: 'singers', kind: 'no-vocals', text: 'singers: no separated vocals' }
    case 'failed':
      return { step: 'singers', kind: singers.kind, text: `singers failed: ${singers.kind}` }
    default:
      return null
  }
}

/** Returns the status of the singer step for the report. A `split` outcome with one voice found one singer. */
function singerStatus(singers: SingerOutcome | null): SingerSection['status'] {
  if (singers === null) return 'option-off'
  if (singers.status === 'split' && singers.voiceCount === 1) return 'one-singer'
  return singers.status
}

/** Returns the singer section of the report. */
function singerSection(record: RunRecord): SingerSection {
  const { singers } = record
  return {
    status: singerStatus(singers),
    failureKind: singers?.status === 'failed' ? singers.kind : null,
    diagnostics: record.singerDiagnostics,
    rangeCount: record.singerSegments?.length ?? null,
    shareThreshold: SINGER_SHARE,
    ...(record.assignment ?? NO_ASSIGNMENT),
    voicesMade: singers !== null && 'voiceCount' in singers ? singers.voiceCount : null,
  }
}

/** The assignment counts of a singer step that did not assign the phrases. */
const NO_ASSIGNMENT = {
  singersWithPhrases: null,
  phrasesWithNoSinger: null,
  phrasesWithMoreSingers: null,
} as const

/** The facts of the end of a run that `finishRunRecord` needs from the run. */
export type RunEnd = {
  request: TranscribeRequest
  range: TimeRange
  frameMs: number
  /** The marks that the run wrote, before the singer step. */
  written: readonly Mark[]
  /** The device that ran the speech model, for a speech model run in the browser. */
  device: 'webgpu' | 'wasm'
}

function sourceFacts(request: TranscribeRequest, device: 'webgpu' | 'wasm') {
  if (request.mode === 'lyrics-only')
    return { source: 'browser' as const, endpointHost: null, speechModel: null, device: null }
  if (request.remote !== undefined) {
    return {
      source: 'remote' as const,
      endpointHost: endpointHost(request.remote.baseUrl),
      speechModel: request.remote.model,
      device: null,
    }
  }
  return {
    source: 'browser' as const,
    endpointHost: null,
    speechModel: request.speechModelId,
    device,
  }
}

/** Returns the run data of a completed run: the singer ranges and the report. */
export function finishRunRecord(record: RunRecord, end: RunEnd): RunData {
  record.clock.enter(null)
  const content = useSongStore.getState().current
  const runVoices = [end.request.voiceId, ...record.singerVoiceIds]
  const voices = (content?.voices ?? []).filter((voice) => runVoices.includes(voice.id))
  const report = buildRunReport({
    startedAt: record.startedAt,
    build: __APP_BUILD__,
    ...sourceFacts(end.request, end.device),
    mode: end.request.mode,
    separationModel: record.separationModel,
    separationFallback: record.separationFallback,
    trackCount: record.trackCount,
    tracksKept: record.tracks !== null,
    singers: singerSection(record),
    voices: voicePhrases(voices, content?.marks ?? [], end.range, record.singerVoiceIds),
    marks: end.written,
    range: { startMs: end.range.startMs, endMs: end.range.endMs },
    frameMs: end.frameMs,
    durationsMs: record.clock.durations(),
    notes: record.notes,
  })
  return {
    songId: content?.song.id ?? '',
    ...(record.tracks === null ? {} : { tracks: record.tracks }),
    singerSegments: record.singerSegments ?? [],
    report,
  }
}

/**
 * The longest time that a run waits for the write of its run data, in milliseconds.
 * A transaction that does not end must not hold the result of the run. Two audio tracks of a long song make a write of tens of MB.
 */
export const RUN_DATA_WRITE_LIMIT_MS = 5000

/**
 * The result of the write of the run data:
 * - `stored`: the app stored all run data.
 * - `storage-full`: the browser storage was full, so the app stored the run data with no audio tracks.
 * - `failed`: the app stored no run data, or the write did not end in `RUN_DATA_WRITE_LIMIT_MS`.
 */
export type RunDataWrite = 'stored' | 'storage-full' | 'failed'

/** Writes the run data, and a second time with no audio tracks when the storage is full. */
async function writeRunData(data: RunData): Promise<RunDataWrite> {
  try {
    await saveRunData(data)
    return 'stored'
  } catch (error) {
    if (!(error instanceof StorageFullError) || data.tracks === undefined) return 'failed'
  }
  const report = {
    ...data.report,
    tracksKept: false,
    notes: [...data.report.notes, STORAGE_FULL_NOTE],
  }
  return saveRunData({ songId: data.songId, singerSegments: data.singerSegments, report }).then(
    (): RunDataWrite => 'storage-full',
    (): RunDataWrite => 'failed',
  )
}

/**
 * Stores the run data and returns the result of the write.
 * A run must complete when the browser cannot store its data, so the function never rejects.
 * A full storage gives a second write with no audio tracks, so the singer ranges and the report stay.
 * After `RUN_DATA_WRITE_LIMIT_MS`, the function returns `failed`. The write can still end later.
 * @param data The run data of a completed run.
 */
export function keepRunData(data: RunData): Promise<RunDataWrite> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<RunDataWrite>((resolve) => {
    timer = setTimeout(() => resolve('failed'), RUN_DATA_WRITE_LIMIT_MS)
  })
  return Promise.race([writeRunData(data), late]).finally(() => clearTimeout(timer))
}
