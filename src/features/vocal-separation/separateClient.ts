import type { SeparateMessage, SeparateRequest, StereoAudio } from './protocol.ts'
import type { SeparationFailureKind } from './separationFailure.ts'

declare global {
  /**
   * When an E2E test sets this flag to true before the app starts, the client uses the fixture worker.
   * The fixture worker downloads no model and returns the mono mix as the vocals.
   */
  var __SEPARATE_FIXTURE__: boolean | undefined
}

/** The cause of a rejected vocal separation. */
export type SeparateErrorKind = SeparationFailureKind | 'cancelled'

/** A vocal separation failed or stopped. `kind` tells the dialog which message to show. */
export class SeparateError extends Error {
  readonly kind: SeparateErrorKind
  constructor(kind: SeparateErrorKind, detail: string) {
    super(detail)
    this.name = 'SeparateError'
    this.kind = kind
  }
}

/** The part of `Worker` that the client uses. Tests supply a fake. */
export type SeparateWorkerLike = {
  postMessage(message: SeparateRequest, transfer: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<SeparateMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** The functions and the signal of one vocal separation. */
export type SeparateHandlers = {
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  onDownload?: (loadedBytes: number, totalBytes: number) => void
  /** Receives the audio time that is complete, and the audio time of the run. */
  onProgress?: (doneMs: number, totalMs: number) => void
  /** Stops the separation. The client then terminates the worker. */
  signal?: AbortSignal
}

function createDefaultWorker(): SeparateWorkerLike {
  if (globalThis.__SEPARATE_FIXTURE__ === true) {
    return new Worker(new URL('../../workers/separateFixture.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return new Worker(new URL('../../workers/separate.worker.ts', import.meta.url), {
    type: 'module',
  })
}

let runCount = 0

/**
 * Returns the vocals of the audio: one channel at 44 100 Hz, with the length of the input.
 * Each call starts a new separate worker and terminates it at the end, so the memory of the model goes back to the browser.
 * The client transfers the channel buffers to the worker, so the caller cannot read `audio` after the call.
 * @param audio The stereo audio of the run.
 * @param handlers The progress functions and the cancel signal.
 * @param createWorker Makes the worker. The default reads the fixture flag `__SEPARATE_FIXTURE__`.
 * Rejects with SeparateError of kind 'cancelled' when the signal aborts, else with the kind that the worker reports.
 */
export function separateVocals(
  audio: StereoAudio,
  handlers: SeparateHandlers = {},
  createWorker: () => SeparateWorkerLike = createDefaultWorker,
): Promise<Float32Array> {
  const { signal } = handlers
  if (signal?.aborted === true) return Promise.reject(cancelled())
  runCount += 1
  const runId = runCount
  const worker = createWorker()
  return new Promise<Float32Array>((resolve, reject) => {
    function finish(): void {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    function fail(error: SeparateError): void {
      finish()
      reject(error)
    }
    function onAbort(): void {
      fail(cancelled())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onerror = (event) => fail(new SeparateError('unknown', event.message))
    worker.onmessage = ({ data }) => {
      if (data.runId !== runId) return
      if (data.type === 'download') handlers.onDownload?.(data.loadedBytes, data.totalBytes)
      else if (data.type === 'progress') handlers.onProgress?.(data.doneMs, data.totalMs)
      else if (data.type === 'error') fail(new SeparateError(data.kind, data.detail))
      else {
        finish()
        resolve(data.vocals)
      }
    }
    // Two channels can share one buffer, and a transfer list that names a buffer two times throws.
    const transfer = [...new Set([audio.left.buffer, audio.right.buffer])]
    worker.postMessage({ type: 'separate', runId, audio }, transfer)
  })
}

function cancelled(): SeparateError {
  return new SeparateError('cancelled', 'The person cancelled the vocal separation.')
}
