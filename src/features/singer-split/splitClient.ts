import type { StereoAudio } from '../vocal-separation/protocol.ts'
import type {
  SplitFailureKind,
  SplitMessage,
  SplitMode,
  SplitRequest,
  SplitResult,
} from './protocol.ts'

declare global {
  /**
   * When an E2E test sets this flag to true before the app starts, the client uses the fixture worker.
   * The fixture worker downloads no model and returns two singer tracks that each keep one part of the vocals.
   */
  var __SPLIT_FIXTURE__: boolean | undefined
}

/** The cause of a rejected singer split. */
export type SplitErrorKind = SplitFailureKind | 'cancelled'

/** A singer split failed or stopped. `kind` tells the dialog which message to show. */
export class SplitError extends Error {
  readonly kind: SplitErrorKind
  constructor(kind: SplitErrorKind, detail: string) {
    super(detail)
    this.name = 'SplitError'
    this.kind = kind
  }
}

/** The part of `Worker` that the client uses. Tests supply a fake. */
export type SplitWorkerLike = {
  postMessage(message: SplitRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<SplitMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** The functions and the signal of one singer split. */
export type SplitHandlers = {
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  onDownload?: (loadedBytes: number, totalBytes: number) => void
  /** Receives the audio time that is complete, and the audio time of the run. */
  onProgress?: (doneMs: number, totalMs: number) => void
  /** Stops the split. The client then terminates the worker. */
  signal?: AbortSignal
}

function createDefaultWorker(): SplitWorkerLike {
  if (globalThis.__SPLIT_FIXTURE__ === true) {
    return new Worker(new URL('../../workers/splitFixture.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return new Worker(new URL('../../workers/split.worker.ts', import.meta.url), { type: 'module' })
}

let runCount = 0

/**
 * Returns the two singer tracks of the vocals, each stereo at 44 100 Hz with the length of the input.
 * Each call starts a new split worker and terminates it at the end, so the memory of the model goes back to the browser.
 * The client transfers the channel buffers to the worker, so the caller cannot read `vocals` after the call.
 * @param vocals The separated vocals at 44 100 Hz.
 * @param mode The mode that the person selected.
 * @param handlers The progress functions and the cancel signal.
 * @param createWorker Makes the worker. The default reads the fixture flag `__SPLIT_FIXTURE__`.
 * Rejects with SplitError of kind 'cancelled' when the signal aborts, else with the kind that the worker reports.
 */
export function splitSingers(
  vocals: StereoAudio,
  mode: SplitMode,
  handlers: SplitHandlers = {},
  createWorker: () => SplitWorkerLike = createDefaultWorker,
): Promise<SplitResult> {
  const { signal } = handlers
  if (signal?.aborted === true) return Promise.reject(cancelled())
  runCount += 1
  const runId = runCount
  const worker = createWorker()
  return new Promise<SplitResult>((resolve, reject) => {
    function finish(): void {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    function fail(error: SplitError): void {
      finish()
      reject(error)
    }
    function onAbort(): void {
      worker.postMessage({ type: 'cancel', runId })
      fail(cancelled())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onerror = (event) => fail(new SplitError('unknown', event.message))
    worker.onmessage = ({ data }) => {
      if (data.runId !== runId) return
      if (data.type === 'download') handlers.onDownload?.(data.loadedBytes, data.totalBytes)
      else if (data.type === 'progress') handlers.onProgress?.(data.doneMs, data.totalMs)
      else if (data.type === 'error') fail(new SplitError(data.kind, data.detail))
      else {
        finish()
        resolve({ tracks: data.tracks })
      }
    }
    // Two channels can share one buffer, and a transfer list that names a buffer two times throws.
    const transfer = [...new Set([vocals.left.buffer, vocals.right.buffer])]
    worker.postMessage({ type: 'split', runId, vocals, mode }, transfer)
  })
}

function cancelled(): SplitError {
  return new SplitError('cancelled', 'The person cancelled the singer split.')
}
