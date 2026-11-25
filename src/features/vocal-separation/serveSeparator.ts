import type { SeparateMessage, SeparateRequest, SeparationModelId } from './protocol.ts'
import { separationFailureKind } from './separationFailure.ts'
import type { Separator } from './separator.ts'

/** Sends one message to the page, with the buffers to transfer. */
export type PostSeparateMessage = (message: SeparateMessage, transfer?: Transferable[]) => void

/**
 * Returns the message handler of a separate worker.
 * The handler makes the engine at the first request, runs each request, and posts the progress, the vocals or the error.
 * @param createEngine Makes the engine of the model of the first request. The handler calls it one time.
 * @param post Sends a message to the page.
 */
export function serveSeparator(
  createEngine: (model: SeparationModelId) => Separator,
  post: PostSeparateMessage,
): (data: unknown) => Promise<void> {
  let engine: Separator | null = null
  return async (data) => {
    // The thread workers of a WASM runtime can load the worker file too, and their messages are not requests.
    if (!isRequest(data)) return
    const { runId, audio, model = 'spleeter' } = data
    try {
      engine ??= createEngine(model)
      const vocals = await engine.separate(audio, {
        download: (loadedBytes, totalBytes) =>
          post({ type: 'download', runId, loadedBytes, totalBytes }),
        progress: (doneMs, totalMs) => post({ type: 'progress', runId, doneMs, totalMs }),
      })
      post({ type: 'result', runId, vocals }, [vocals.buffer])
    } catch (error) {
      post({ type: 'error', runId, kind: separationFailureKind(error), detail: String(error) })
    }
  }
}

function isRequest(data: unknown): data is SeparateRequest {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'separate'
}
