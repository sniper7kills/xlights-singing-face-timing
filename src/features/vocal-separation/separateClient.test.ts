import { describe, expect, it, vi } from 'vitest'
import type { SeparateMessage, SeparateRequest, StereoAudio } from './protocol.ts'
import { SeparateError, separateVocals, type SeparateWorkerLike } from './separateClient.ts'

/** A fake worker that records each request and lets the test send the replies. */
class FakeWorker implements SeparateWorkerLike {
  received: { message: SeparateRequest; transfer: Transferable[] }[] = []
  terminated = false
  onmessage: ((event: MessageEvent<SeparateMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: SeparateRequest, transfer: Transferable[]): void {
    this.received.push({ message, transfer })
  }
  terminate(): void {
    this.terminated = true
  }
  reply(message: SeparateMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<SeparateMessage>)
  }
  runId(): number {
    const first = this.received[0]
    if (first === undefined) throw new Error('The worker received no request.')
    return first.message.runId
  }
}

function stereo(length = 4): StereoAudio {
  return { left: new Float32Array(length), right: new Float32Array(length), sampleRate: 44100 }
}

function start(audio = stereo(), signal?: AbortSignal) {
  const worker = new FakeWorker()
  const onDownload = vi.fn()
  const onProgress = vi.fn()
  const result = separateVocals(audio, { onDownload, onProgress, signal }, () => worker)
  return { worker, onDownload, onProgress, result }
}

async function rejection(promise: Promise<unknown>): Promise<SeparateError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SeparateError))
    throw new Error('The call did not reject with SeparateError.')
  return error
}

describe('separateVocals', () => {
  it('posts the audio and transfers the buffer of each channel', () => {
    const audio = stereo()
    const { worker } = start(audio)

    expect(worker.received).toHaveLength(1)
    expect(worker.received[0]?.message).toEqual({ type: 'separate', runId: worker.runId(), audio })
    expect(worker.received[0]?.transfer).toEqual([audio.left.buffer, audio.right.buffer])
  })

  it('posts the model of the run', () => {
    const worker = new FakeWorker()

    void separateVocals(stereo(), { model: 'demucs' }, () => worker)

    expect(worker.received[0]?.message.model).toBe('demucs')
  })

  it('names a buffer one time when both channels share it', () => {
    const channel = new Float32Array(4)
    const { worker } = start({ left: channel, right: channel, sampleRate: 44100 })

    expect(worker.received[0]?.transfer).toEqual([channel.buffer])
  })

  it('sends the download and the progress to the handlers, and resolves with the vocals', async () => {
    const { worker, onDownload, onProgress, result } = start()
    const runId = worker.runId()
    const vocals = new Float32Array([0.5, 0.25])

    worker.reply({ type: 'download', runId, loadedBytes: 10, totalBytes: 40 })
    worker.reply({ type: 'progress', runId, doneMs: 500, totalMs: 1000 })
    worker.reply({ type: 'result', runId, vocals })

    await expect(result).resolves.toBe(vocals)
    expect(onDownload).toHaveBeenCalledWith(10, 40)
    expect(onProgress).toHaveBeenCalledWith(500, 1000)
    expect(worker.terminated).toBe(true)
  })

  it('ignores a message of another run', async () => {
    const { worker, onProgress, result } = start()
    const runId = worker.runId()

    worker.reply({ type: 'progress', runId: runId + 1, doneMs: 1, totalMs: 2 })
    worker.reply({ type: 'result', runId: runId + 1, vocals: new Float32Array(1) })
    worker.reply({ type: 'result', runId, vocals: new Float32Array(2) })

    expect(onProgress).not.toHaveBeenCalled()
    expect(await result).toHaveLength(2)
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
    const { worker, result } = start(stereo(), controller.signal)

    controller.abort()

    expect((await rejection(result)).kind).toBe('cancelled')
    expect(worker.terminated).toBe(true)
  })

  it('starts no worker when the signal aborted before the call', async () => {
    const controller = new AbortController()
    controller.abort()
    const createWorker = vi.fn(() => new FakeWorker())

    const result = separateVocals(stereo(), { signal: controller.signal }, createWorker)

    expect((await rejection(result)).kind).toBe('cancelled')
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('gives each call a new run id', () => {
    const first = start().worker.runId()
    const second = start().worker.runId()

    expect(second).not.toBe(first)
  })
})
