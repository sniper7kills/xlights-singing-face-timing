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
import { saveRunData } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, RunData } from '../../store/types.ts'
import { SeparateError } from '../vocal-separation/separateClient.ts'
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
    singerSegments: record.singerSegments ?? [],
    report,
  }
}

/**
 * Stores the run data. A run must complete when the browser cannot store its report, so a failed write changes nothing else.
 * @param data The run data of a completed run.
 */
export async function keepRunData(data: RunData): Promise<void> {
  await saveRunData(data).catch(() => undefined)
}
