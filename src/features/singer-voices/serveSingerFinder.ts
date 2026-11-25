import type { SingersMessage, SingersRequest } from './protocol.ts'
import { singerFailureKind } from './singerFailure.ts'
import type { SingerFinder } from './singerFinder.ts'

/** Sends one message to the page. */
export type PostSingersMessage = (message: SingersMessage) => void

/**
 * Returns the message handler of a singers worker.
 * The handler makes the engine at the first request, runs each request, and posts the progress, the segments or the error.
 * @param createEngine Makes the engine. The handler calls it one time.
 * @param post Sends a message to the page.
 */
export function serveSingerFinder(
  createEngine: () => SingerFinder,
  post: PostSingersMessage,
): (data: unknown) => Promise<void> {
  let engine: SingerFinder | null = null
  return async (data) => {
    // The thread workers of a WASM runtime can load the worker file too, and their messages are not requests.
    if (!isRequest(data)) return
    const { runId, vocals, singerCount } = data
    try {
      engine ??= createEngine()
      const segments = await engine.find(
        vocals,
        {
          download: (loadedBytes, totalBytes) =>
            post({ type: 'download', runId, loadedBytes, totalBytes }),
          progress: (doneMs, totalMs) => post({ type: 'progress', runId, doneMs, totalMs }),
        },
        singerCount,
      )
      post({ type: 'result', runId, segments })
    } catch (error) {
      post({ type: 'error', runId, kind: singerFailureKind(error), detail: String(error) })
    }
  }
}

function isRequest(data: unknown): data is SingersRequest {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'find-singers'
}
