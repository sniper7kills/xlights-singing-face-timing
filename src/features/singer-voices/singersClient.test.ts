import { describe, expect, it, vi } from 'vitest'
import type { SingerSegment, SingersMessage, SingersRequest } from './protocol.ts'
import { findSingers, SingersError, type SingersWorkerLike } from './singersClient.ts'

/** A fake worker that records each request and lets the test send the replies. */
class FakeWorker implements SingersWorkerLike {
  received: SingersRequest[] = []
  terminated = false
  onmessage: ((event: MessageEvent<SingersMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: SingersRequest): void {
    this.received.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  reply(message: SingersMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<SingersMessage>)
  }
  runId(): number {
    const first = this.received[0]
    if (first === undefined) throw new Error('The worker received no request.')
    return first.runId
  }
}

const SEGMENTS: SingerSegment[] = [{ startMs: 0, endMs: 500, singer: 0 }]

function start(vocals = new Float32Array(4), signal?: AbortSignal) {
  const worker = new FakeWorker()
  const onDownload = vi.fn()
  const onProgress = vi.fn()
  const result = findSingers(vocals, { onDownload, onProgress, signal }, () => worker)
  return { worker, onDownload, onProgress, result }
}

async function rejection(promise: Promise<unknown>): Promise<SingersError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SingersError))
    throw new Error('The call did not reject with SingersError.')
  return error
}

describe('findSingers', () => {
  it('posts the vocals and keeps them readable for the caller', () => {
    const vocals = new Float32Array([0.5, 0.25])
    const { worker } = start(vocals)

    expect(worker.received).toEqual([{ type: 'find-singers', runId: worker.runId(), vocals }])
    expect(vocals).toHaveLength(2)
  })

  it('posts the count of singers that the person gives', () => {
    const worker = new FakeWorker()
    const vocals = new Float32Array(4)
    void findSingers(vocals, { singerCount: 2 }, () => worker)

    expect(worker.received).toEqual([
      { type: 'find-singers', runId: worker.runId(), vocals, singerCount: 2 },
    ])
  })

  it('sends the download and the progress to the handlers, and resolves with the segments', async () => {
    const { worker, onDownload, onProgress, result } = start()
    const runId = worker.runId()

    worker.reply({ type: 'download', runId, loadedBytes: 10, totalBytes: 40 })
    worker.reply({ type: 'progress', runId, doneMs: 500, totalMs: 1000 })
    worker.reply({ type: 'result', runId, segments: SEGMENTS })

    await expect(result).resolves.toBe(SEGMENTS)
    expect(onDownload).toHaveBeenCalledWith(10, 40)
    expect(onProgress).toHaveBeenCalledWith(500, 1000)
    expect(worker.terminated).toBe(true)
  })

  it('ignores a message of another run', async () => {
    const { worker, onProgress, result } = start()
    const runId = worker.runId()

    worker.reply({ type: 'progress', runId: runId + 1, doneMs: 1, totalMs: 2 })
    worker.reply({ type: 'result', runId: runId + 1, segments: [] })
    worker.reply({ type: 'result', runId, segments: SEGMENTS })

    expect(onProgress).not.toHaveBeenCalled()
    expect(await result).toBe(SEGMENTS)
  })

  it.each(['download', 'memory', 'model', 'unknown'] as const)(
    'rejects with the kind %s that the worker reports, and terminates the worker',
    async (kind) => {
      const { worker, result } = start()

      worker.reply({ type: 'error', runId: worker.runId(), kind, detail: 'detail' })

      const error = await rejection(result)
      expect(error.kind).toBe(kind)
      expect(error.message).toBe('detail')
      expect(worker.terminated).toBe(true)
    },
  )

  it('rejects with the kind unknown when the worker script fails', async () => {
    const { worker, result } = start()

    worker.onerror?.({ message: 'SyntaxError' } as ErrorEvent)

    expect((await rejection(result)).kind).toBe('unknown')
    expect(worker.terminated).toBe(true)
  })

  it('terminates the worker and rejects as cancelled when the signal aborts', async () => {
    const controller = new AbortController()
    const { worker, result } = start(new Float32Array(4), controller.signal)

    controller.abort()

    expect((await rejection(result)).kind).toBe('cancelled')
    expect(worker.terminated).toBe(true)
  })

  it('starts no worker when the signal aborted before the call', async () => {
    const controller = new AbortController()
    controller.abort()
    const createWorker = vi.fn(() => new FakeWorker())

    const result = findSingers(new Float32Array(4), { signal: controller.signal }, createWorker)

    expect((await rejection(result)).kind).toBe('cancelled')
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('gives each call a new run id', () => {
    const first = start().worker.runId()
    const second = start().worker.runId()

    expect(second).not.toBe(first)
  })
})
