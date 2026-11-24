import { formatClock } from '../../lib/time/formatClock.ts'
import { CHUNK_LENGTH_S, type Device } from './protocol.ts'
import {
  NoWordsError,
  type RunStage,
  type TranscribeMode,
  type TranscribeOutcome,
} from './runTranscription.ts'
import { TranscribeError } from './transcribeClient.ts'

/**
 * A state in which a transcribe run is active and the dialog shows its progress.
 * `started` is a speech model run that has sent no progress yet.
 */
export type RunState =
  | { status: 'preparing' }
  | { status: 'loading' }
  | { status: 'downloading'; percent: number }
  | { status: 'started' }
  | { status: 'transcribing'; doneMs: number; totalMs: number }
  | { status: 'finishing' }

/** The state of the transcribe dialog. The dialog closes in the state `done`. */
export type DialogState =
  | { status: 'idle' }
  | RunState
  | { status: 'confirm-replace'; resume: RunState }
  | { status: 'low-match'; ratio: number; resume: RunState }
  | { status: 'error'; message: string }
  | { status: 'done' }

/** A change that the dialog or the transcribe run sends to the dialog state. */
export type DialogEvent =
  | { type: 'start'; mode: TranscribeMode }
  | { type: 'stage'; stage: RunStage }
  | { type: 'download'; percent: number }
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

/** Returns the message that the dialog shows for a failed run. */
export function errorMessage(error: unknown): string {
  if (error instanceof NoWordsError) return ERROR_COPY.noWords
  if (error instanceof TranscribeError && error.kind === 'download') return ERROR_COPY.download
  if (error instanceof TranscribeError && error.kind === 'memory') return ERROR_COPY.memory
  return ERROR_COPY.failed
}

/** Returns true when the error is the stop of a run that the person asked for. */
export function isCancel(error: unknown): boolean {
  return error instanceof TranscribeError && error.kind === 'cancelled'
}

/** Returns the text of the toast after a run, for example "214 words, 9 estimated". */
export function outcomeText(
  outcome: Pick<TranscribeOutcome, 'wordCount' | 'estimatedCount'>,
): string {
  const words = outcome.wordCount === 1 ? 'word' : 'words'
  return `${outcome.wordCount} ${words}, ${outcome.estimatedCount} estimated`
}

/** Returns the copy of the low-match warning for a match ratio from 0 to 1. */
export function lowMatchMessage(ratio: number): string {
  return `Only ${wholePercent(ratio)}% of the lyrics matched the audio. Check that the lyrics belong to this song.`
}

/** The text of each run state without its numbers. The live region reads it, so a screen reader hears each state one time. */
const STATE_LABEL: Record<RunState['status'], string> = {
  preparing: 'Preparing audio',
  loading: 'Loading speech model',
  downloading: 'Downloading speech model',
  started: 'Transcribing',
  transcribing: 'Transcribing',
  finishing: 'Aligning lyrics and breaking down words',
}

/** Returns the text that the live region announces for a run state. */
export function stateLabel(state: RunState): string {
  return STATE_LABEL[state.status]
}

/** Returns true when the run state has no progress value and the dialog shows the elapsed time. */
export function showsElapsed(state: RunState): boolean {
  return state.status === 'preparing' || state.status === 'loading' || state.status === 'started'
}

/**
 * Returns the text of the progress area for a run state, for example "Transcribing, 1:12 of 3:40".
 * @param elapsedMs The time from the "Start" click. A state with no progress value shows it, for example "Transcribing, 0:12 elapsed".
 */
export function progressText(state: RunState, elapsedMs: number): string {
  if (showsElapsed(state)) return `${STATE_LABEL[state.status]}, ${formatClock(elapsedMs)} elapsed`
  switch (state.status) {
    case 'downloading':
      return `Downloading speech model, ${state.percent}%`
    case 'transcribing':
      return `Transcribing, ${formatClock(state.doneMs)} of ${formatClock(state.totalMs)}`
    default:
      return STATE_LABEL[state.status]
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
  if (state.status === 'downloading') return state.percent / 100
  if (state.status === 'transcribing')
    return state.totalMs > 0 ? Math.min(1, state.doneMs / state.totalMs) : 0
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
    type: 'stage' | 'download' | 'progress' | 'finishing' | 'confirm-replace' | 'confirm-low-match'
  }
>

const STAGE_STATE: Record<RunStage, RunState> = {
  preparing: { status: 'preparing' },
  loading: { status: 'loading' },
  transcribing: { status: 'started' },
}
type EndEvent = Extract<DialogEvent, { type: 'answer' | 'cancelled' | 'failed' | 'done' }>

function runStep(state: DialogState, event: RunEvent): DialogState {
  switch (event.type) {
    case 'stage':
      return STAGE_STATE[event.stage]
    case 'download':
      return { status: 'downloading', percent: event.percent }
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

/**
 * Returns the run state that the progress area shows, or null when no run is active.
 * A confirm state shows the progress of the run that waits for the answer.
 */
export function shownRunState(state: DialogState): RunState | null {
  if (state.status === 'confirm-replace' || state.status === 'low-match') return state.resume
  return isRunState(state) ? state : null
}
