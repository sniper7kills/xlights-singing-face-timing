import type { SplitMessage, SplitRequest } from './protocol.ts'
import { splitFailureKind } from './splitFailure.ts'
import type { Splitter } from './splitter.ts'

/** Sends one message to the page, with the buffers to transfer. */
export type PostSplitMessage = (message: SplitMessage, transfer?: Transferable[]) => void

/**
 * Returns the message handler of a split worker.
 * The handler makes the engine at the first request, runs each request, and posts the progress, the tracks or the error.
 * A `cancel` message aborts the signal of the run with the same id.
 * @param createEngine Makes the engine. The handler calls it one time.
 * @param post Sends a message to the page.
 */
export function serveSplitter(
  createEngine: () => Splitter,
  post: PostSplitMessage,
): (data: unknown) => Promise<void> {
  let engine: Splitter | null = null
  const runs = new Map<number, AbortController>()
  return async (data) => {
    // The thread workers of a WASM runtime can load the worker file too, and their messages are not requests.
    if (!isRequest(data)) return
    if (data.type === 'cancel') {
      runs.get(data.runId)?.abort()
      return
    }
    const { runId, vocals, mode } = data
    const controller = new AbortController()
    runs.set(runId, controller)
    try {
      engine ??= createEngine()
      const { tracks } = await engine.split(
        vocals,
        mode,
        {
          download: (loadedBytes, totalBytes) =>
            post({ type: 'download', runId, loadedBytes, totalBytes }),
          progress: (doneMs, totalMs) => post({ type: 'progress', runId, doneMs, totalMs }),
        },
        controller.signal,
      )
      const buffers = tracks.flatMap(({ audio }) => [audio.left.buffer, audio.right.buffer])
      post({ type: 'result', runId, tracks }, [...new Set(buffers)])
    } catch (error) {
      post({ type: 'error', runId, kind: splitFailureKind(error), detail: String(error) })
    } finally {
      runs.delete(runId)
    }
  }
}

function isRequest(data: unknown): data is SplitRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data.type === 'split' || data.type === 'cancel')
  )
}
