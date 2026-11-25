import { RemoteError } from '../../lib/remote/response.ts'
import { formatClock } from '../../lib/time/formatClock.ts'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { CHUNK_LENGTH_S, type Device } from './protocol.ts'
import {
  NoWordsError,
  type RunStage,
  type SingerOutcome,
  type TranscribeMode,
  type TranscribeOutcome,
} from './runTranscription.ts'
import type { RunDataWrite } from './runRecord.ts'
import { TranscribeError } from './transcribeClient.ts'
import { formatMegabytes } from '../audio-import/libraryFormat.ts'
import { keptTracksBytes } from '../../lib/audio/pcm.ts'
import { SeparateError } from '../vocal-separation/separateClient.ts'
import { SINGER_MODEL_BYTES } from '../singer-voices/engine/singerModelBytes.ts'
import { separationModelMb } from '../vocal-separation/engine/separationModels.ts'
import type { SeparationModelId } from '../vocal-separation/protocol.ts'

/**
 * A state in which a transcribe run is active and the dialog shows its progress.
 * `started` is a speech model run that has sent no progress yet.
 */
export type RunState =
  | { status: 'preparing' }
  | { status: 'separation-loading' }
  | { status: 'separation-downloading'; percent: number }
  | { status: 'separation-started' }
  | { status: 'separating'; doneMs: number; totalMs: number }
  | { status: 'loading' }
  | { status: 'downloading'; percent: number }
  | { status: 'started' }
  | { status: 'transcribing'; doneMs: number; totalMs: number }
  | { status: 'sending'; percent: number | null }
  | { status: 'waiting' }
  | { status: 'finishing' }
  | { status: 'singers-loading' }
  | { status: 'singers-downloading'; percent: number }
  | { status: 'singers-started' }
  | { status: 'finding-singers'; doneMs: number; totalMs: number }

/** The state of the transcribe dialog. The dialog closes in the state `done`. */
export type DialogState =
  | { status: 'idle' }
  | RunState
  | { status: 'confirm-replace'; resume: RunState }
  | { status: 'low-match'; ratio: number; resume: RunState }
  | {
      status: 'separation-failed'
      message: string
      /** True offers "Use the fast model": the Demucs run failed for memory. */
      fastModel: boolean
      resume: RunState
    }
  | { status: 'error'; message: string }
  | { status: 'done' }

/** A change that the dialog or the transcribe run sends to the dialog state. */
export type DialogEvent =
  | { type: 'start'; mode: TranscribeMode }
  | { type: 'stage'; stage: RunStage }
  | { type: 'download'; percent: number }
  | { type: 'separation-download'; percent: number }
  | { type: 'separation-progress'; doneMs: number; totalMs: number }
  | { type: 'confirm-no-separation'; error: unknown; model?: SeparationModelId }
  | { type: 'singers-download'; percent: number }
  | { type: 'singers-progress'; doneMs: number; totalMs: number }
  | { type: 'upload'; percent: number }
  | { type: 'progress'; doneMs: number; totalMs: number }
  | { type: 'finishing' }
  | { type: 'confirm-replace' }
  | { type: 'confirm-low-match'; ratio: number }
  | { type: 'answer' }
  | { type: 'cancelled' }
  | { type: 'failed'; error: unknown }
  | { type: 'done' }

export const IDLE: DialogState = { status: 'idle' }

/** The copy of the edge case table in docs/specs/features/02-transcription.md. */
export const ERROR_COPY = {
  download: 'The speech model did not download. Check the connection and retry.',
  memory: 'This browser ran out of memory. Select a smaller speech model.',
  noWords: 'No words were found. Paste the lyrics and use Lyrics only.',
  failed: 'The transcription failed. Select a smaller speech model and retry.',
} as const

/**
 * Returns a ratio from 0 to 1 as a whole percent, rounded down.
 * The rounding is down, so a ratio below the 30% warning limit never shows as 30%.
 */
export function wholePercent(ratio: number): number {
  // 0.29 * 100 is 28.999999999999996 in floating point.
  return Math.max(0, Math.min(100, Math.floor(ratio * 100 + 1e-9)))
}

/**
 * Returns the download progress as a whole percent.
 * @param loadedBytes The bytes that the browser has.
 * @param totalBytes The size of the files that started to load. The value grows when the next file starts.
 */
export function downloadPercent(loadedBytes: number, totalBytes: number): number {
  return totalBytes > 0 ? wholePercent(loadedBytes / totalBytes) : 0
}

/** The message before "Start" when the browser blocks the call to the endpoint as mixed content. */
export const MIXED_CONTENT_MESSAGE =
  'This page is secure (https), and the browser blocks a call to an http address. Use an https address for the endpoint.'

/** Returns the warning that the dialog shows before each remote run. */
export function remoteWarning(host: string): string {
  return `The app sends the audio of this song to ${host}. The audio leaves this computer.`
}

/**
 * The copy of each failure of a remote run, from the edge case table in docs/specs/features/02-transcription.md.
 * The browser does not tell a CORS refusal from no connection, so the `network` copy names both causes.
 */
const REMOTE_COPY: Record<RemoteError['kind'], (error: RemoteError, origin: string) => string> = {
  network: ({ host }, origin) =>
    `The app could not connect to ${host}. The server is not available, or its CORS settings block this page. Check that the server runs and sends the header Access-Control-Allow-Origin: ${origin}`,
  auth: ({ host, status }) =>
    `${host} refused the API key (HTTP ${status}). Check the API key of the remote endpoint.`,
  'not-found': ({ host }) =>
    `${host} has no transcription service at this address (HTTP 404). Check the base URL. It usually ends with /v1.`,
  'too-large': () =>
    'The audio is too large for the remote endpoint. Select a shorter part of the song in the editor, and transcribe the time selection.',
  'rate-limit': ({ host }) =>
    `${host} received too many requests (HTTP 429). Wait one minute, then select Retry.`,
  server: ({ host, status }) =>
    `${host} reported an error (HTTP ${status}). Check the server, then select Retry.`,
  refused: ({ host, status }) =>
    `${host} refused the request (HTTP ${status}). Check the speech model name of the remote endpoint.`,
  'not-json': ({ host }) =>
    `${host} did not return JSON. Check the base URL. It usually ends with /v1.`,
  'no-word-times': ({ host }) =>
    `${host} returned no word times. Use a server and a speech model that return the words field of verbose_json.`,
}

/**
 * Returns the message for a failure of a remote run or of "Test connection".
 * @param error The failure.
 * @param origin The origin of the app, for the CORS header that the server needs.
 */
export function remoteErrorMessage(error: RemoteError, origin: string): string {
  return REMOTE_COPY[error.kind](error, origin)
}

/** Returns the message that the dialog shows for a failed run. */
export function errorMessage(error: unknown): string {
  if (error instanceof RemoteError) return remoteErrorMessage(error, globalThis.location.origin)
  if (error instanceof NoWordsError) return ERROR_COPY.noWords
  if (error instanceof TranscribeError && error.kind === 'download') return ERROR_COPY.download
  if (error instanceof TranscribeError && error.kind === 'memory') return ERROR_COPY.memory
  return ERROR_COPY.failed
}

/**
 * The copy of each failure of the vocal separation, from the edge case table in docs/specs/features/02-transcription.md.
 * `model` and `unknown` share one message.
 */
export const SEPARATION_COPY = {
  download:
    'The app could not download the vocal separation model. Check the connection. Then try again, or continue with no separation.',
  memory:
    'This browser does not have enough memory to separate the vocals of this song. Select a shorter time range, or continue with no separation.',
  failed: 'The vocal separation did not work. Continue with no separation, or cancel.',
} as const

/** Returns the message that the dialog shows when the vocal separation fails. */
export function separationErrorMessage(error: unknown): string {
  if (error instanceof SeparateError && error.kind === 'download') return SEPARATION_COPY.download
  if (error instanceof SeparateError && error.kind === 'memory') return SEPARATION_COPY.memory
  return SEPARATION_COPY.failed
}

/**
 * Returns the note under the check box "Separate the vocals first".
 * @param host The host of the remote endpoint of the run, or null for a run in the browser.
 * @param model The selected vocal separation model. The note states its download size.
 */
export function separationNote(host: string | null, model: SeparationModelId = 'spleeter'): string {
  const where =
    host === null
      ? 'The audio stays in this browser.'
      : `The app separates the vocals in this browser, and then sends the vocals to ${host}.`
  return `The app removes the instruments before it finds the words. This step downloads a model of ${separationModelMb(model)} MB one time and adds time to the run. ${where}`
}

/** Returns the text of a choice of "Separation model", with the download size from the model list. */
export function separationModelLabel(model: SeparationModelId): string {
  const mb = separationModelMb(model)
  return model === 'demucs'
    ? `Demucs, experimental (${mb} MB, much slower)`
    : `Fast (Spleeter, ${mb} MB)`
}

/** The warning before a Demucs run on a browser with no WebGPU adapter. Issue #117 measured 4.3 to 4.5 GB on `wasm`. */
export const DEMUCS_WASM_WARNING =
  'Demucs needs about 4 GB of memory and several minutes for a song on this browser.'

/** Returns true when a failed separation can run again with Spleeter: Demucs failed for memory. */
function offersFastModel(error: unknown, model: SeparationModelId | undefined): boolean {
  return model === 'demucs' && error instanceof SeparateError && error.kind === 'memory'
}

/** The download size of the two singer models in megabytes (1 MB = 1 000 000 bytes), as the speech model sizes. */
const SINGER_MODEL_MB = Math.round(SINGER_MODEL_BYTES / 1_000_000)

/** The note under the check box "Put each singer on its own voice". */
export const SINGER_NOTE = `The app estimates which singer sings each phrase, and makes one voice for each singer. Check the result. Use "Move to voice" to correct a phrase. The app can find too many singers. This step downloads models of ${SINGER_MODEL_MB} MB one time.`

/** The note of the "Singers" choice under the check box "Put each singer on its own voice". */
export const SINGER_COUNT_NOTE = 'Select the count if you know it. The result is better.'

/** The hint of the check box "Put each singer on its own voice" while "Separate the vocals first" is off. */
/**
 * Returns the note under "Keep the separated tracks", with the bytes that the two tracks use.
 * @param durationMs The length of the song, or of the range of the run.
 */
export function keepTracksNote(durationMs: number): string {
  return `The app stores the vocals and the instruments of this song in this browser, about ${formatMegabytes(keptTracksBytes(durationMs))} MB. You can listen to each track in the editor.`
}

export const SINGER_HINT = 'Select "Separate the vocals first" to use this option.'

/** The hint under the singer note while the option is on and a small speech model runs in this browser. */
export const SINGER_MODEL_HINT = 'A larger speech model finds more of the quiet parts.'

/**
 * Returns true when the dialog shows `SINGER_MODEL_HINT`.
 * Issue #137 measured that the base speech model wrote few of the quiet chorus lines, so those lines got no phrase.
 * @param remote True when the run uses the remote endpoint, which has no speech model choice.
 * @param speechModelId The selected speech model of this browser.
 */
export function showsSingerModelHint(remote: boolean, speechModelId: string): boolean {
  return !remote && (speechModelId === 'whisper-tiny' || speechModelId === 'whisper-base')
}

/**
 * Returns the sentences that the toast adds when the singer step made no new voice, or found more singers than free voices.
 * The download and memory failures name their cause. Each other failure shares one message.
 * @param singers The outcome of a singer step. A `split` outcome gives the message for one singer.
 */
export function singerMessage(singers: SingerOutcome): string {
  const stay = `All phrases stay on ${singers.voiceName}.`
  switch (singers.status) {
    case 'split':
      return `The app found one singer. ${stay} If the song has more singers, select the count in "Singers" and run again.`
    case 'capped':
      if (singers.voiceCount === 1)
        return `The song has ${MAX_VOICES} voices, so the app cannot add a voice for each singer. ${stay}`
      return `The song has room for ${singers.voiceCount - 1} more voices. The other singers stay on ${singers.voiceName}.`
    case 'cancelled':
      return `The app stopped the search for the singers. ${stay}`
    case 'no-vocals':
      return `The app finds the singers only in separated vocals. ${stay}`
    case 'failed':
      if (singers.kind === 'download')
        return `The app could not download the singer model. Check the connection. ${stay}`
      if (singers.kind === 'memory')
        return `This browser does not have enough memory to find the singers of this song. ${stay}`
      return `The app could not find the singers. ${stay}`
  }
}

/** Returns true when the error is the stop of a run that the person asked for. */
export function isCancel(error: unknown): boolean {
  return error instanceof TranscribeError && error.kind === 'cancelled'
}

/** The toast sentence of a run whose run data the app stored with no audio tracks, because the storage is full. */
export const TRACKS_STORAGE_FULL_MESSAGE =
  'The browser storage is full, so the app did not keep the separated tracks.'

/** The toast sentence of a run whose run data the app did not store. */
export const RUN_DATA_FAILED_MESSAGE = 'The app could not store the run report.'

/** The toast sentence of a run whose write of the run data did not end in time. The write continues. */
export const RUN_DATA_LATE_MESSAGE =
  'The app still stores the run report. It shows in "Run report" when it is ready.'

/** The toast sentence for each result of the write of the run data. A stored write adds none. */
const RUN_DATA_MESSAGE: Record<RunDataWrite, string | null> = {
  stored: null,
  'storage-full': TRACKS_STORAGE_FULL_MESSAGE,
  failed: RUN_DATA_FAILED_MESSAGE,
  late: RUN_DATA_LATE_MESSAGE,
}

/**
 * Returns the text of the toast after a run: the counts, then the sentence of the write of the run data when the write was not complete.
 * See `countsText` for the counts.
 */
export function outcomeText(
  outcome: Pick<TranscribeOutcome, 'wordCount' | 'estimatedCount' | 'singers' | 'runData'>,
): string {
  const message = RUN_DATA_MESSAGE[outcome.runData]
  const counts = countsText(outcome)
  return message === null ? counts : `${counts}. ${message}`
}

/**
 * Returns the counts of a run, for example "214 words, 9 estimated".
 * After a singer step that made voices, the text names the voice count, for example "214 words on 3 voices, 9 estimated".
 * After a singer step that made no voice, or that found more singers than free voices, the text adds the message of `singerMessage`.
 */
function countsText(
  outcome: Pick<TranscribeOutcome, 'wordCount' | 'estimatedCount' | 'singers'>,
): string {
  const words = `${outcome.wordCount} ${outcome.wordCount === 1 ? 'word' : 'words'}`
  const { singers } = outcome
  const voiceCount = singers !== undefined && 'voiceCount' in singers ? singers.voiceCount : 1
  const counts =
    voiceCount > 1
      ? `${words} on ${voiceCount} voices, ${outcome.estimatedCount} estimated`
      : `${words}, ${outcome.estimatedCount} estimated`
  if (singers === undefined || (singers.status === 'split' && voiceCount > 1)) return counts
  return `${counts}. ${singerMessage(singers)}`
}

/** Returns the copy of the low-match warning for a match ratio from 0 to 1. */
export function lowMatchMessage(ratio: number): string {
  return `Only ${wholePercent(ratio)}% of the lyrics matched the audio. Check that the lyrics belong to this song.`
}

/**
 * The text of each run state without its numbers. The live region reads it, so a screen reader hears each state one time.
 * The two states of a remote run name the host of the endpoint.
 */
const STATE_LABEL: Record<RunState['status'], (host: string, model: SeparationModelId) => string> =
  {
    preparing: () => 'Preparing audio',
    'separation-loading': (_host, model) => `Loading ${separationModelNoun(model)}`,
    'separation-downloading': (_host, model) => `Downloading ${separationModelNoun(model)}`,
    'separation-started': () => 'Separating vocals',
    separating: () => 'Separating vocals',
    loading: () => 'Loading speech model',
    downloading: () => 'Downloading speech model',
    started: () => 'Transcribing',
    transcribing: () => 'Transcribing',
    sending: (host) => `Sending audio to ${host}`,
    waiting: (host) => `Waiting for ${host}`,
    finishing: () => 'Aligning lyrics and breaking down words',
    'singers-loading': () => 'Loading singer model',
    'singers-downloading': () => 'Downloading singer model',
    'singers-started': () => 'Finding the singers',
    'finding-singers': () => 'Finding the singers',
  }

/** Returns the name of the vocal separation model in the load and download steps. The Spleeter text is the text of issue #117. */
function separationModelNoun(model: SeparationModelId): string {
  return model === 'demucs' ? 'Demucs vocal separation model' : 'vocal separation model'
}

/**
 * Returns the text that the live region announces for a run state.
 * @param host The host of the remote endpoint. A run in the browser does not read it.
 * @param model The vocal separation model of the run. The load and download steps name it.
 */
export function stateLabel(
  state: RunState,
  host: string,
  model: SeparationModelId = 'spleeter',
): string {
  return STATE_LABEL[state.status](host, model)
}

/** Returns true when the run state has no progress value and the dialog shows the elapsed time. */
export function showsElapsed(state: RunState): boolean {
  if (state.status === 'sending') return state.percent === null
  return (
    state.status === 'preparing' ||
    state.status === 'separation-loading' ||
    state.status === 'separation-started' ||
    state.status === 'loading' ||
    state.status === 'started' ||
    state.status === 'waiting' ||
    state.status === 'singers-loading' ||
    state.status === 'singers-started'
  )
}

/**
 * Returns the text of the progress area for a run state, for example "Transcribing, 1:12 of 3:40".
 * @param elapsedMs The time from the "Start" click. A state with no progress value shows it, for example "Transcribing, 0:12 elapsed".
 * @param host The host of the remote endpoint. A run in the browser does not read it.
 * @param model The vocal separation model of the run. The load and download steps name it.
 */
export function progressText(
  state: RunState,
  elapsedMs: number,
  host: string,
  model: SeparationModelId = 'spleeter',
): string {
  const label = stateLabel(state, host, model)
  if (showsElapsed(state)) return `${label}, ${formatClock(elapsedMs)} elapsed`
  switch (state.status) {
    case 'downloading':
    case 'separation-downloading':
    case 'singers-downloading':
    case 'sending':
      return `${label}, ${state.percent}%`
    case 'transcribing':
    case 'finding-singers':
      return `${label}, ${formatClock(state.doneMs)} of ${formatClock(state.totalMs)}`
    case 'separating':
      // The step adds time to the run, so the person also sees the time from the "Start" click.
      return `${label}, ${formatClock(state.doneMs)} of ${formatClock(state.totalMs)}, ${formatClock(elapsedMs)} elapsed`
    default:
      return label
  }
}

/** The name of each device in the device line of a run. */
export const DEVICE_LABEL: Record<Device, string> = {
  webgpu: 'Graphics card (WebGPU)',
  wasm: 'CPU',
}

/** The message after the watchdog moves a WebGPU run to `wasm`. */
export const SLOW_GPU_MESSAGE = 'The graphics card was too slow. The run continues on the CPU.'

/** The audio time and the run time of a speech model run, both in milliseconds. */
export type RunSpeed = { audioMs: number; runMs: number }

/**
 * Returns the speed of a run after its first chunk, or null before the end of the first chunk.
 * @param doneMs The audio time that is complete.
 * @param totalMs The audio time of the run. A run shorter than one chunk has its speed at the end.
 * @param runMs The time from the start of the run in the worker to this progress.
 */
export function runSpeed(doneMs: number, totalMs: number, runMs: number): RunSpeed | null {
  const firstChunkMs = Math.min(CHUNK_LENGTH_S * 1000, totalMs)
  return doneMs >= firstChunkMs && runMs > 0 ? { audioMs: doneMs, runMs } : null
}

/**
 * Returns the speed in plain words, for example "about 2 times faster than the song".
 * The ratio is the seconds of audio for each second of the run, rounded to a whole number.
 */
export function speedText({ audioMs, runMs }: RunSpeed): string {
  const ratio = audioMs / runMs
  const times = Math.round(ratio >= 1 ? ratio : 1 / ratio)
  if (times <= 1) return 'about as fast as the song'
  return `about ${times} times ${ratio >= 1 ? 'faster' : 'slower'} than the song`
}

/**
 * Returns the device line of a run, for example "CPU, about 2 times faster than the song".
 * @param device The device that runs the speech model now.
 * @param speed The speed after the first chunk, or null before it.
 */
export function deviceLine(device: Device, speed: RunSpeed | null): string {
  return speed === null ? DEVICE_LABEL[device] : `${DEVICE_LABEL[device]}, ${speedText(speed)}`
}

/** Returns the value of the progress bar from 0 to 1, or undefined for a bar with no value. */
export function progressValue(state: RunState): number | undefined {
  if ('percent' in state) return state.percent === null ? undefined : state.percent / 100
  if ('doneMs' in state) return state.totalMs > 0 ? Math.min(1, state.doneMs / state.totalMs) : 0
  return undefined
}

/** Returns true when the state belongs to an active run, the confirm states included. */
export function isActive(state: DialogState): boolean {
  return state.status !== 'idle' && state.status !== 'error' && state.status !== 'done'
}

/**
 * Returns the next dialog state.
 * A run event that arrives after the run stopped changes nothing.
 */
export function transcribeDialogReducer(state: DialogState, event: DialogEvent): DialogState {
  if (event.type === 'start') {
    // A lyrics-only run uses no speech model, so its first step is the align step.
    return event.mode === 'model' ? { status: 'preparing' } : { status: 'finishing' }
  }
  if (!isActive(state)) return state
  if (isAudioStepEvent(event)) return audioStep(state, event)
  return event.type === 'answer' ||
    event.type === 'cancelled' ||
    event.type === 'failed' ||
    event.type === 'done'
    ? endStep(state, event)
    : runStep(state, event)
}

type RunEvent = Extract<
  DialogEvent,
  {
    type:
      | 'stage'
      | 'download'
      | 'upload'
      | 'progress'
      | 'finishing'
      | 'confirm-replace'
      | 'confirm-low-match'
  }
>

const STAGE_STATE: Record<RunStage, RunState> = {
  preparing: { status: 'preparing' },
  'separation-download': { status: 'separation-loading' },
  separating: { status: 'separation-started' },
  loading: { status: 'loading' },
  transcribing: { status: 'started' },
  sending: { status: 'sending', percent: null },
  waiting: { status: 'waiting' },
  'singers-download': { status: 'singers-loading' },
  'finding-singers': { status: 'singers-started' },
}
type EndEvent = Extract<DialogEvent, { type: 'answer' | 'cancelled' | 'failed' | 'done' }>

function runStep(state: DialogState, event: RunEvent): DialogState {
  switch (event.type) {
    case 'stage':
      return STAGE_STATE[event.stage]
    case 'download':
      return { status: 'downloading', percent: event.percent }
    case 'upload':
      return { status: 'sending', percent: event.percent }
    case 'progress':
      return { status: 'transcribing', doneMs: event.doneMs, totalMs: event.totalMs }
    case 'finishing':
      return { status: 'finishing' }
    case 'confirm-replace':
      return isRunState(state) ? { status: 'confirm-replace', resume: state } : state
    case 'confirm-low-match':
      return isRunState(state) ? { status: 'low-match', ratio: event.ratio, resume: state } : state
  }
}

type AudioStepEvent = Extract<
  DialogEvent,
  {
    type:
      | 'separation-download'
      | 'separation-progress'
      | 'confirm-no-separation'
      | 'singers-download'
      | 'singers-progress'
  }
>

const AUDIO_STEP_EVENT_TYPES: ReadonlySet<DialogEvent['type']> = new Set([
  'separation-download',
  'separation-progress',
  'confirm-no-separation',
  'singers-download',
  'singers-progress',
])

function isAudioStepEvent(event: DialogEvent): event is AudioStepEvent {
  return AUDIO_STEP_EVENT_TYPES.has(event.type)
}

function audioStep(state: DialogState, event: AudioStepEvent): DialogState {
  switch (event.type) {
    case 'separation-download':
      return { status: 'separation-downloading', percent: event.percent }
    case 'separation-progress':
      return { status: 'separating', doneMs: event.doneMs, totalMs: event.totalMs }
    case 'singers-download':
      return { status: 'singers-downloading', percent: event.percent }
    case 'singers-progress':
      return { status: 'finding-singers', doneMs: event.doneMs, totalMs: event.totalMs }
    case 'confirm-no-separation':
      return isRunState(state)
        ? {
            status: 'separation-failed',
            message: separationErrorMessage(event.error),
            fastModel: offersFastModel(event.error, event.model),
            resume: state,
          }
        : state
  }
}

function endStep(state: DialogState, event: EndEvent): DialogState {
  switch (event.type) {
    case 'answer':
      return shownRunState(state) ?? state
    case 'cancelled':
      return IDLE
    case 'failed':
      return { status: 'error', message: errorMessage(event.error) }
    case 'done':
      return { status: 'done' }
  }
}

/** Returns true when the state shows the progress of a run. */
export function isRunState(state: DialogState): state is RunState {
  return state.status in STATE_LABEL
}

/** A state in which the run waits for the answer of the person. */
export type QuestionState = Extract<DialogState, { resume: RunState }>

/** Returns true when the run waits for the answer of the person. */
export function isQuestion(state: DialogState): state is QuestionState {
  return 'resume' in state
}

/**
 * Returns the run state that the progress area shows, or null when no run is active.
 * A confirm state shows the progress of the run that waits for the answer.
 */
export function shownRunState(state: DialogState): RunState | null {
  if (isQuestion(state)) return state.resume
  return isRunState(state) ? state : null
}
