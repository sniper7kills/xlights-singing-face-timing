import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import type { SplitMessage, SplitRequest } from './protocol.ts'
import { SplitError, splitSingers, type SplitWorkerLike } from './splitClient.ts'
import { canSplitSingers } from './webgpu.ts'

function fakeWorker() {
  const posted: { message: SplitRequest; transfer?: Transferable[] }[] = []
  const worker: SplitWorkerLike = {
    postMessage: (message, transfer) => posted.push({ message, transfer }),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  }
  const reply = (message: SplitMessage) =>
    worker.onmessage?.(new MessageEvent('message', { data: message }))
  return { worker, posted, reply }
}

function audio(): StereoAudio {
  const channel = new Float32Array(4)
  return { left: channel, right: channel, sampleRate: 44100 }
}

afterEach(() => {
  globalThis.__SPLIT_WEBGPU__ = undefined
})

describe('splitSingers', () => {
  it('sends the vocals and the mode, passes the progress and resolves with the tracks', async () => {
    const { worker, posted, reply } = fakeWorker()
    const onDownload = vi.fn()
    const onProgress = vi.fn()
    const vocals = audio()

    const result = splitSingers(vocals, 'male-female', { onDownload, onProgress }, () => worker)
    const request = posted[0]?.message
    if (request?.type !== 'split') throw new Error('No split request.')
    // One buffer for both channels must appear one time in the transfer list.
    expect(posted[0]?.transfer).toEqual([vocals.left.buffer])
    expect(request.mode).toBe('male-female')
    reply({ type: 'download', runId: request.runId + 1, loadedBytes: 9, totalBytes: 9 })
    reply({ type: 'download', runId: request.runId, loadedBytes: 1, totalBytes: 2 })
    reply({ type: 'progress', runId: request.runId, doneMs: 3, totalMs: 4 })
    reply({ type: 'result', runId: request.runId, tracks: [] })

    await expect(result).resolves.toEqual({ tracks: [] })
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onDownload).toHaveBeenCalledWith(1, 2)
    expect(onProgress).toHaveBeenCalledWith(3, 4)
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('rejects with the kind that the worker reports', async () => {
    const { worker, posted, reply } = fakeWorker()

    const result = splitSingers(audio(), 'lead-backing', {}, () => worker)
    reply({ type: 'error', runId: posted[0]?.message.runId ?? 0, kind: 'memory', detail: 'x' })

    await expect(result).rejects.toMatchObject({ name: 'SplitError', kind: 'memory' })
  })

  it('rejects as unknown when the worker fails to start', async () => {
    const { worker } = fakeWorker()

    const result = splitSingers(audio(), 'lead-backing', {}, () => worker)
    worker.onerror?.(new ErrorEvent('error', { message: 'no worker' }))

    await expect(result).rejects.toMatchObject({ kind: 'unknown', message: 'no worker' })
  })

  it('sends a cancel, terminates the worker and rejects as cancelled when the signal aborts', async () => {
    const { worker, posted } = fakeWorker()
    const controller = new AbortController()

    const result = splitSingers(audio(), 'male-female', { signal: controller.signal }, () => worker)
    controller.abort()

    await expect(result).rejects.toEqual(
      new SplitError('cancelled', 'The person cancelled the singer split.'),
    )
    expect(posted[1]?.message).toEqual({ type: 'cancel', runId: posted[0]?.message.runId })
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('starts no worker when the signal already aborted', async () => {
    const createWorker = vi.fn()
    const controller = new AbortController()
    controller.abort()

    await expect(
      splitSingers(audio(), 'male-female', { signal: controller.signal }, createWorker),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(createWorker).not.toHaveBeenCalled()
  })
})

describe('canSplitSingers', () => {
  it('uses the WebGPU check of the browser', async () => {
    await expect(canSplitSingers(async () => true)).resolves.toBe(true)
    await expect(canSplitSingers(async () => false)).resolves.toBe(false)
  })

  it('uses the test flag in place of the check', async () => {
    const check = vi.fn(async () => true)
    globalThis.__SPLIT_WEBGPU__ = false

    await expect(canSplitSingers(check)).resolves.toBe(false)
    expect(check).not.toHaveBeenCalled()
  })
})
