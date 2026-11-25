import type { SingerSegment, SingersMessage, SingersRequest } from './protocol.ts'
import type { SingerFailureKind } from './singerFailure.ts'

declare global {
  /**
   * When an E2E test sets this flag to true before the app starts, the client uses the fixture worker.
   * The fixture worker downloads no model and returns two singers who take turns.
   */
  var __SINGERS_FIXTURE__: boolean | undefined
}

/** The cause of a rejected singer search. */
export type SingersErrorKind = SingerFailureKind | 'cancelled'

/** A singer search failed or stopped. `kind` tells the app which message to show. */
export class SingersError extends Error {
  readonly kind: SingersErrorKind
  constructor(kind: SingersErrorKind, detail: string) {
    super(detail)
    this.name = 'SingersError'
    this.kind = kind
  }
}

/** The part of `Worker` that the client uses. Tests supply a fake. */
export type SingersWorkerLike = {
  postMessage(message: SingersRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<SingersMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** The functions, the signal and the singer count of one singer search. */
export type SingersHandlers = {
  /** The count of singers that the person gives. Without it, the engine estimates the count. */
  singerCount?: number
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  onDownload?: (loadedBytes: number, totalBytes: number) => void
  /** Receives the audio time that is complete, and the audio time of the run. */
  onProgress?: (doneMs: number, totalMs: number) => void
  /** Stops the search. The client then terminates the worker. */
  signal?: AbortSignal
}

function createDefaultWorker(): SingersWorkerLike {
  if (globalThis.__SINGERS_FIXTURE__ === true) {
    return new Worker(new URL('../../workers/singersFixture.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return new Worker(new URL('../../workers/singers.worker.ts', import.meta.url), {
    type: 'module',
  })
}

let runCount = 0

/**
 * Returns the time ranges in which each singer sings, with times from the start of the vocals.
 * Each call starts a new singers worker and terminates it at the end, so the memory of the model goes back to the browser.
 * The client copies the vocals to the worker, so the caller can still read them.
 * @param vocals One channel at 16 000 Hz.
 * @param handlers The progress functions and the cancel signal.
 * @param createWorker Makes the worker. The default reads the fixture flag `__SINGERS_FIXTURE__`.
 * Rejects with SingersError of kind 'cancelled' when the signal aborts, else with the kind that the worker reports.
 */
export function findSingers(
  vocals: Float32Array,
  handlers: SingersHandlers = {},
  createWorker: () => SingersWorkerLike = createDefaultWorker,
): Promise<SingerSegment[]> {
  const { signal } = handlers
  if (signal?.aborted === true) return Promise.reject(cancelled())
  runCount += 1
  const runId = runCount
  const worker = createWorker()
  return new Promise<SingerSegment[]>((resolve, reject) => {
    function finish(): void {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    function fail(error: SingersError): void {
      finish()
      reject(error)
    }
    function onAbort(): void {
      fail(cancelled())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onerror = (event) => fail(new SingersError('unknown', event.message))
    worker.onmessage = ({ data }) => {
      if (data.runId !== runId) return
      if (data.type === 'download') handlers.onDownload?.(data.loadedBytes, data.totalBytes)
      else if (data.type === 'progress') handlers.onProgress?.(data.doneMs, data.totalMs)
      else if (data.type === 'error') fail(new SingersError(data.kind, data.detail))
      else {
        finish()
        resolve(data.segments)
      }
    }
    const { singerCount } = handlers
    worker.postMessage(
      singerCount === undefined
        ? { type: 'find-singers', runId, vocals }
        : { type: 'find-singers', runId, vocals, singerCount },
    )
  })
}

function cancelled(): SingersError {
  return new SingersError('cancelled', 'The person cancelled the singer search.')
}
