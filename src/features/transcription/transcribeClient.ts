import {
  CHUNK_LENGTH_S,
  SPEECH_SAMPLE_RATE,
  type Device,
  type ErrorKind,
  type FromWorkerMessage,
  type ToWorkerMessage,
} from './protocol.ts'
import type { TimedWord } from './types.ts'

declare global {
  /**
   * When an E2E test sets this flag to true before the app starts, the client uses the fixture worker.
   * The fixture worker returns the demo song words and downloads no speech model.
   */
  var __TRANSCRIBE_FIXTURE__: boolean | undefined
}

/** The cause of a rejected client call. `stalled` is a WebGPU run that the watchdog stopped. */
export type TranscribeErrorKind = ErrorKind | 'cancelled' | 'busy' | 'stalled'

/**
 * The time in milliseconds that a WebGPU run can go with no progress before the client stops it and continues on `wasm`.
 * A slow graphics card can run slower than the CPU and give no sign of work.
 */
export const WEBGPU_STALL_MS = 45_000

/** The cause of a device change: the WebGPU call failed, or the WebGPU run made no progress. */
export type DeviceChangeReason = 'failed' | 'slow'

/** A step of a transcribe run before its first progress that the client reports. */
export type ClientStage = 'loading' | 'transcribing'

/** A client call failed. `kind` tells the dialog which message to show. */
export class TranscribeError extends Error {
  readonly kind: TranscribeErrorKind
  constructor(kind: TranscribeErrorKind, detail: string) {
    super(detail)
    this.name = 'TranscribeError'
    this.kind = kind
  }
}

/** The part of `Worker` that the client uses. Tests supply a fake. */
export type WorkerLike = {
  postMessage(message: ToWorkerMessage): void
  terminate(): void
  onmessage: ((event: MessageEvent<FromWorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** Receives the download progress of the speech model files. */
export type DownloadHandler = (loadedBytes: number, totalBytes: number) => void

/** The functions that receive the progress of one transcribe run. */
export type TranscribeHandlers = {
  /** Receives the download progress when the client loads the speech model again on `wasm`. */
  onDownload?: DownloadHandler
  /** Receives the audio time that is complete, from the first sample of the run. */
  onProgress?: (doneMs: number) => void
  /**
   * Receives 'transcribing' when the worker starts the run, and 'loading' when the client loads the speech model again on `wasm`.
   * The run starts again from its first sample after a device change.
   */
  onStage?: (stage: ClientStage) => void
}

/** The options of `createTranscribeClient`. */
export type TranscribeClientOptions = {
  /** The first device. `pickDevice` gives the value. */
  device: Device
  /** Receives 'wasm' and the reason when the client moves the speech model from WebGPU to `wasm`. */
  onDeviceChange?: (device: Device, reason: DeviceChangeReason) => void
  /**
   * Receives the device and the speed of each run with one chunk of audio or more: the seconds of audio for each second of run.
   * A shorter run pads its audio to one chunk, so its speed is too low.
   */
  onSpeed?: (device: Device, speed: number) => void
  /** Makes the worker. The default reads the fixture flag `__TRANSCRIBE_FIXTURE__`. */
  createWorker?: () => WorkerLike
}

/** Runs the speech model in a Web Worker. The client handles one call at a time. */
export type TranscribeClient = {
  /** The device that runs the speech model now. */
  readonly device: Device
  /**
   * Loads a speech model and resolves when it is ready.
   * If the same speech model is ready, the call resolves at once.
   * @param speechModelId One `SpeechModel.id`.
   * @param onDownload Receives the download progress. The worker reports no progress for a cached speech model.
   * Rejects with TranscribeError.
   */
  load(speechModelId: string, onDownload?: DownloadHandler): Promise<void>
  /**
   * Transcribes the samples with the loaded speech model and returns the words with song times.
   * If the run fails on WebGPU, or makes no progress for `WEBGPU_STALL_MS`, the client loads the speech model on `wasm` and runs once more.
   * @param samples One channel at `SPEECH_SAMPLE_RATE`. `resampleForSpeech` gives the value.
   * @param offsetMs The song time of the first sample.
   * @param handlers The functions that receive the progress.
   * Rejects with TranscribeError.
   */
  transcribe(
    samples: Float32Array,
    offsetMs: number,
    handlers?: TranscribeHandlers,
  ): Promise<TimedWord[]>
  /**
   * Stops the active call at once and rejects it with the kind 'cancelled'.
   * The library has no stop operation, so the client terminates the worker. The next call loads the speech model again.
   */
  cancel(): void
  /** Terminates the worker. */
  dispose(): void
}

type LoadPending = {
  type: 'load'
  onDownload?: DownloadHandler
  resolve: () => void
  reject: (error: TranscribeError) => void
}

type RunPending = {
  type: 'run'
  runId: string
  /** The `Date.now()` of the run start. */
  startedAtMs: number
  audioMs: number
  onProgress?: (doneMs: number) => void
  resolve: (words: TimedWord[]) => void
  reject: (error: TranscribeError) => void
}

type Pending = LoadPending | RunPending

function createDefaultWorker(): WorkerLike {
  if (globalThis.__TRANSCRIBE_FIXTURE__ === true) {
    return new Worker(new URL('../../workers/transcribeFixture.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return new Worker(new URL('../../workers/transcribe.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Returns a client that starts the transcribe worker when the first call needs it.
 * @param options The first device, the device change and speed handlers, and the worker factory.
 */
export function createTranscribeClient(options: TranscribeClientOptions): TranscribeClient {
  const createWorker = options.createWorker ?? createDefaultWorker
  let device = options.device
  let worker: WorkerLike | null = null
  let loadedModelId: string | null = null
  let lastModelId: string | null = null
  let pending: Pending | null = null
  let runCount = 0
  let watchdog: ReturnType<typeof setTimeout> | null = null

  function stopWatchdog(): void {
    if (watchdog !== null) clearTimeout(watchdog)
    watchdog = null
  }

  /** Starts the wait for the next progress of a WebGPU run again. A `wasm` run has no watchdog. */
  function armWatchdog(): void {
    stopWatchdog()
    if (device !== 'webgpu') return
    watchdog = setTimeout(() => {
      watchdog = null
      reset()
      settleError(new TranscribeError('stalled', 'The WebGPU run made no progress.'))
    }, WEBGPU_STALL_MS)
  }

  function reset(): void {
    worker?.terminate()
    worker = null
    loadedModelId = null
  }

  function settleError(error: TranscribeError): void {
    stopWatchdog()
    const active = pending
    pending = null
    active?.reject(error)
  }

  function handleLoadMessage(active: LoadPending, message: FromWorkerMessage): void {
    if (message.type === 'download') {
      active.onDownload?.(message.loadedBytes, message.totalBytes)
    } else if (message.type === 'ready') {
      pending = null
      loadedModelId = lastModelId
      active.resolve()
    } else if (message.type === 'error') {
      settleError(new TranscribeError(message.kind, message.detail))
    }
  }

  function reportSpeed(run: RunPending): void {
    const runMs = Date.now() - run.startedAtMs
    if (run.audioMs < CHUNK_LENGTH_S * 1000 || runMs <= 0) return
    options.onSpeed?.(device, run.audioMs / runMs)
  }

  function handleRunMessage(active: RunPending, message: FromWorkerMessage): void {
    if (message.type === 'download' || message.type === 'ready' || message.runId !== active.runId)
      return
    if (message.type === 'progress') {
      armWatchdog()
      active.onProgress?.(message.doneMs)
    } else if (message.type === 'result') {
      stopWatchdog()
      pending = null
      reportSpeed(active)
      active.resolve(message.words)
    } else {
      settleError(new TranscribeError(message.kind, message.detail))
    }
  }

  function handleMessage(message: FromWorkerMessage): void {
    if (pending?.type === 'load') handleLoadMessage(pending, message)
    else if (pending?.type === 'run') handleRunMessage(pending, message)
  }

  function ensureWorker(): WorkerLike {
    if (worker !== null) return worker
    const created = createWorker()
    created.onmessage = (event) => handleMessage(event.data)
    created.onerror = (event) => {
      reset()
      settleError(new TranscribeError('unknown', event.message))
    }
    worker = created
    return created
  }

  function start<T>(
    build: (resolve: (value: T) => void, reject: (error: TranscribeError) => void) => Pending,
    message: () => ToWorkerMessage,
  ): Promise<T> {
    if (pending !== null)
      return Promise.reject(new TranscribeError('busy', 'A transcribe call is already active.'))
    return new Promise<T>((resolve, reject) => {
      pending = build(resolve, reject)
      ensureWorker().postMessage(message())
    })
  }

  function loadOnce(speechModelId: string, onDownload?: DownloadHandler): Promise<void> {
    if (pending === null && loadedModelId === speechModelId) return Promise.resolve()
    return start<void>(
      (resolve, reject) => {
        lastModelId = speechModelId
        return { type: 'load', onDownload, resolve: () => resolve(), reject }
      },
      () => ({ type: 'load', speechModelId, device }),
    )
  }

  function runOnce(
    samples: Float32Array,
    offsetMs: number,
    handlers: TranscribeHandlers,
  ): Promise<TimedWord[]> {
    runCount += 1
    const runId = `run-${runCount}`
    return start<TimedWord[]>(
      (resolve, reject) => {
        handlers.onStage?.('transcribing')
        armWatchdog()
        return {
          type: 'run',
          runId,
          startedAtMs: Date.now(),
          audioMs: (samples.length / SPEECH_SAMPLE_RATE) * 1000,
          onProgress: handlers.onProgress,
          resolve,
          reject,
        }
      },
      () => ({ type: 'transcribe', runId, samples, offsetMs }),
    )
  }

  /** Returns true and moves to `wasm` when the error is the first WebGPU failure or stall. */
  function moveToWasm(error: unknown): boolean {
    if (!(error instanceof TranscribeError) || device !== 'webgpu') return false
    if (error.kind !== 'device' && error.kind !== 'stalled') return false
    reset()
    device = 'wasm'
    options.onDeviceChange?.('wasm', error.kind === 'stalled' ? 'slow' : 'failed')
    return true
  }

  return {
    get device() {
      return device
    },
    async load(speechModelId, onDownload) {
      try {
        await loadOnce(speechModelId, onDownload)
      } catch (error) {
        if (!moveToWasm(error)) throw error
        await loadOnce(speechModelId, onDownload)
      }
    },
    async transcribe(samples, offsetMs, handlers = {}) {
      try {
        return await runOnce(samples, offsetMs, handlers)
      } catch (error) {
        const modelId = lastModelId
        if (modelId === null || !moveToWasm(error)) throw error
        handlers.onStage?.('loading')
        await loadOnce(modelId, handlers.onDownload)
        return runOnce(samples, offsetMs, handlers)
      }
    },
    cancel() {
      if (pending === null) return
      reset()
      settleError(new TranscribeError('cancelled', 'The person cancelled the transcribe run.'))
    },
    dispose() {
      reset()
      settleError(new TranscribeError('cancelled', 'The client closed.'))
    },
  }
}
