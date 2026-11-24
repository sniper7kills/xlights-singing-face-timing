import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeviceSpeeds } from '../../store/types.ts'
import { pickDevice } from './device.ts'
import { SPEECH_SAMPLE_RATE, type FromWorkerMessage, type ToWorkerMessage } from './protocol.ts'
import {
  createTranscribeClient,
  TranscribeError,
  WEBGPU_STALL_MS,
  type WorkerLike,
} from './transcribeClient.ts'

/** A fake worker that records each message and lets the test send the replies. */
class FakeWorker implements WorkerLike {
  received: ToWorkerMessage[] = []
  terminated = false
  onmessage: ((event: MessageEvent<FromWorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: ToWorkerMessage): void {
    this.received.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  reply(message: FromWorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<FromWorkerMessage>)
  }
  lastRunId(): string {
    const last = this.received.at(-1)
    if (last?.type !== 'transcribe')
      throw new Error('The last message is not a transcribe message.')
    return last.runId
  }
}

function setup(device: 'webgpu' | 'wasm' = 'wasm') {
  const workers: FakeWorker[] = []
  const onDeviceChange = vi.fn()
  const onSpeed = vi.fn()
  const client = createTranscribeClient({
    device,
    onDeviceChange,
    onSpeed,
    createWorker: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
  })
  const current = () => {
    const worker = workers.at(-1)
    if (worker === undefined) throw new Error('No worker exists.')
    return worker
  }
  return { client, workers, current, onDeviceChange, onSpeed }
}

const samples = new Float32Array(16_000)
const words = [{ text: 'Silent', startMs: 100, endMs: 2300 }]

async function loaded(device: 'webgpu' | 'wasm' = 'wasm') {
  const context = setup(device)
  const load = context.client.load('whisper-base')
  context.current().reply({ type: 'ready' })
  await load
  return context
}

describe('createTranscribeClient', () => {
  it('starts no worker before the first call', () => {
    const { workers } = setup()
    expect(workers).toHaveLength(0)
  })

  it('sends the speech model and the device, and passes download progress', async () => {
    const { client, current } = setup('webgpu')
    const onDownload = vi.fn()
    const load = client.load('whisper-base', onDownload)
    expect(current().received).toEqual([
      { type: 'load', speechModelId: 'whisper-base', device: 'webgpu' },
    ])
    current().reply({ type: 'download', loadedBytes: 50, totalBytes: 100 })
    current().reply({ type: 'ready' })
    await load
    expect(onDownload).toHaveBeenCalledWith(50, 100)
  })

  it('resolves at once when the same speech model is ready', async () => {
    const { client, current } = await loaded()
    await client.load('whisper-base')
    expect(current().received).toHaveLength(1)
  })

  it('passes progress and resolves with the words of the result', async () => {
    const { client, current } = await loaded()
    const onProgress = vi.fn()
    const run = client.transcribe(samples, 2000, { onProgress })
    const runId = current().lastRunId()
    expect(current().received.at(-1)).toEqual({
      type: 'transcribe',
      runId,
      samples,
      offsetMs: 2000,
    })
    current().reply({ type: 'progress', runId, doneMs: 30_000 })
    current().reply({ type: 'result', runId, words })
    await expect(run).resolves.toEqual(words)
    expect(onProgress).toHaveBeenCalledWith(30_000)
  })

  it('ignores messages of another run', async () => {
    const { client, current } = await loaded()
    const onProgress = vi.fn()
    const run = client.transcribe(samples, 0, { onProgress })
    current().reply({ type: 'progress', runId: 'old-run', doneMs: 5 })
    current().reply({ type: 'result', runId: current().lastRunId(), words: [] })
    await run
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('rejects with the kind of the worker error', async () => {
    const { client, current } = await loaded()
    const run = client.transcribe(samples, 0)
    current().reply({
      type: 'error',
      runId: current().lastRunId(),
      kind: 'memory',
      detail: 'Aborted(OOM)',
    })
    await expect(run).rejects.toMatchObject({ kind: 'memory', message: 'Aborted(OOM)' })
  })

  it('rejects a load with the kind download', async () => {
    const { client, current } = setup()
    const load = client.load('whisper-base')
    current().reply({ type: 'error', kind: 'download', detail: 'Failed to fetch' })
    await expect(load).rejects.toMatchObject({ kind: 'download' })
  })

  it('rejects a second call while a run is active', async () => {
    const { client, current } = await loaded()
    const first = client.transcribe(samples, 0)
    await expect(client.transcribe(samples, 0)).rejects.toMatchObject({ kind: 'busy' })
    await expect(client.load('whisper-tiny')).rejects.toMatchObject({ kind: 'busy' })
    current().reply({ type: 'result', runId: current().lastRunId(), words })
    await expect(first).resolves.toEqual(words)
  })

  it('terminates the worker on cancel and rejects the run with the kind cancelled', async () => {
    const { client, workers, current } = await loaded()
    const run = client.transcribe(samples, 0)
    client.cancel()
    await expect(run).rejects.toBeInstanceOf(TranscribeError)
    await expect(run).rejects.toMatchObject({ kind: 'cancelled' })
    expect(workers[0]?.terminated).toBe(true)
    const reload = client.load('whisper-base')
    expect(workers).toHaveLength(2)
    current().reply({ type: 'ready' })
    await reload
  })

  it('does nothing on cancel when no call is active', async () => {
    const { client, workers } = await loaded()
    client.cancel()
    expect(workers[0]?.terminated).toBe(false)
  })

  it('loads on wasm and runs once more after a WebGPU run fails', async () => {
    const { client, workers, current, onDeviceChange } = await loaded('webgpu')
    const run = client.transcribe(samples, 0)
    current().reply({
      type: 'error',
      runId: current().lastRunId(),
      kind: 'device',
      detail: 'device lost',
    })
    await vi.waitFor(() => expect(workers).toHaveLength(2))
    expect(workers[0]?.terminated).toBe(true)
    expect(onDeviceChange).toHaveBeenCalledExactlyOnceWith('wasm', 'failed')
    expect(client.device).toBe('wasm')
    expect(current().received).toEqual([
      { type: 'load', speechModelId: 'whisper-base', device: 'wasm' },
    ])
    current().reply({ type: 'ready' })
    await vi.waitFor(() => expect(current().received).toHaveLength(2))
    current().reply({ type: 'result', runId: current().lastRunId(), words })
    await expect(run).resolves.toEqual(words)
  })

  it('reports the start of the run, and the model load and the new start after a device change', async () => {
    const { client, current } = await loaded('webgpu')
    const onStage = vi.fn()
    const run = client.transcribe(samples, 0, { onStage })
    expect(onStage.mock.calls).toEqual([['transcribing']])
    current().reply({ type: 'error', runId: current().lastRunId(), kind: 'device', detail: 'x' })
    await vi.waitFor(() => expect(onStage.mock.calls).toEqual([['transcribing'], ['loading']]))
    current().reply({ type: 'ready' })
    await vi.waitFor(() => expect(onStage).toHaveBeenCalledTimes(3))
    expect(onStage).toHaveBeenLastCalledWith('transcribing')
    current().reply({ type: 'result', runId: current().lastRunId(), words })
    await run
  })

  it('loads on wasm after a WebGPU load fails', async () => {
    const { client, workers, current } = setup('webgpu')
    const load = client.load('whisper-base')
    current().reply({ type: 'error', kind: 'device', detail: 'no adapter' })
    await vi.waitFor(() => expect(workers).toHaveLength(2))
    current().reply({ type: 'ready' })
    await load
    expect(client.device).toBe('wasm')
  })

  it('rejects after the second failure on wasm', async () => {
    const { client, current } = await loaded('webgpu')
    const run = client.transcribe(samples, 0)
    current().reply({
      type: 'error',
      runId: current().lastRunId(),
      kind: 'device',
      detail: 'device lost',
    })
    await vi.waitFor(() => expect(current().received).toHaveLength(1))
    current().reply({ type: 'ready' })
    await vi.waitFor(() => expect(current().received).toHaveLength(2))
    current().reply({
      type: 'error',
      runId: current().lastRunId(),
      kind: 'memory',
      detail: 'Aborted(OOM)',
    })
    await expect(run).rejects.toMatchObject({ kind: 'memory' })
  })

  it('rejects the active call with the kind unknown when the worker script fails', async () => {
    const { client, current } = setup()
    const load = client.load('whisper-base')
    const worker = current()
    worker.onerror?.({ message: 'script failed' } as ErrorEvent)
    await expect(load).rejects.toMatchObject({ kind: 'unknown', message: 'script failed' })
    expect(worker.terminated).toBe(true)
  })

  describe('watchdog', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('stops a WebGPU run with no progress for 45 seconds and runs again on wasm', async () => {
      vi.useFakeTimers()
      const { client, workers, current, onDeviceChange } = await loaded('webgpu')
      const run = client.transcribe(samples, 0)
      const first = current()

      await vi.advanceTimersByTimeAsync(WEBGPU_STALL_MS)

      expect(first.terminated).toBe(true)
      expect(onDeviceChange).toHaveBeenCalledExactlyOnceWith('wasm', 'slow')
      expect(client.device).toBe('wasm')
      expect(workers).toHaveLength(2)
      expect(current().received).toEqual([
        { type: 'load', speechModelId: 'whisper-base', device: 'wasm' },
      ])
      current().reply({ type: 'ready' })
      await vi.advanceTimersByTimeAsync(0)
      const again = current().received.at(-1)
      expect(again).toMatchObject({ type: 'transcribe', samples, offsetMs: 0 })
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await expect(run).resolves.toEqual(words)
    })

    it('waits 45 seconds again after each progress', async () => {
      vi.useFakeTimers()
      const { client, current, onDeviceChange } = await loaded('webgpu')
      const onProgress = vi.fn()
      const run = client.transcribe(samples, 0, { onProgress })

      await vi.advanceTimersByTimeAsync(WEBGPU_STALL_MS - 1)
      current().reply({ type: 'progress', runId: current().lastRunId(), doneMs: 4000 })
      await vi.advanceTimersByTimeAsync(WEBGPU_STALL_MS - 1)

      expect(onDeviceChange).not.toHaveBeenCalled()
      expect(current().terminated).toBe(false)
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await expect(run).resolves.toEqual(words)
    })

    it('stops no wasm run', async () => {
      vi.useFakeTimers()
      const { client, current, onDeviceChange } = await loaded('wasm')
      const run = client.transcribe(samples, 0)

      await vi.advanceTimersByTimeAsync(WEBGPU_STALL_MS * 4)

      expect(onDeviceChange).not.toHaveBeenCalled()
      expect(current().terminated).toBe(false)
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await expect(run).resolves.toEqual(words)
    })

    it('stops the watchdog when the run ends, fails or is cancelled', async () => {
      vi.useFakeTimers()
      const { client, current, onDeviceChange } = await loaded('webgpu')
      const done = client.transcribe(samples, 0)
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await done
      const cancelled = client.transcribe(samples, 0)
      client.cancel()
      await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' })

      await vi.advanceTimersByTimeAsync(WEBGPU_STALL_MS * 2)

      expect(onDeviceChange).not.toHaveBeenCalled()
    })
  })

  describe('measured speed', () => {
    const minute = new Float32Array(60 * SPEECH_SAMPLE_RATE)

    afterEach(() => {
      vi.useRealTimers()
    })

    /** Runs one minute of audio on the device for `runMs` of fake time and returns the reported speed. */
    async function timedRun(device: 'webgpu' | 'wasm', runMs: number): Promise<DeviceSpeeds> {
      const { client, current, onSpeed } = await loaded(device)
      const run = client.transcribe(minute, 0)
      // A progress before the end keeps the WebGPU watchdog from stopping a slow run.
      for (let elapsed = 0; elapsed < runMs; elapsed += 10_000) {
        await vi.advanceTimersByTimeAsync(Math.min(10_000, runMs - elapsed))
        current().reply({ type: 'progress', runId: current().lastRunId(), doneMs: 1000 })
      }
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await run
      expect(onSpeed).toHaveBeenCalledOnce()
      const [reported, speed] = onSpeed.mock.calls[0] as ['webgpu' | 'wasm', number]
      return { [reported]: speed }
    }

    it('reports the seconds of audio for each second of run', async () => {
      vi.useFakeTimers()

      await expect(timedRun('wasm', 20_000)).resolves.toEqual({ wasm: 3 })
    })

    it('reports no speed for a run shorter than one chunk', async () => {
      vi.useFakeTimers()
      const { client, current, onSpeed } = await loaded('wasm')
      const run = client.transcribe(samples, 0)
      await vi.advanceTimersByTimeAsync(1000)
      current().reply({ type: 'result', runId: current().lastRunId(), words })
      await run

      expect(onSpeed).not.toHaveBeenCalled()
    })

    it('selects wasm when the fake WebGPU run takes longer than the fake wasm run', async () => {
      vi.useFakeTimers()
      const wasm = await timedRun('wasm', 20_000)
      const webgpu = await timedRun('webgpu', 80_000)

      expect(pickDevice(true, { ...wasm, ...webgpu }, Date.now())).toBe('wasm')
    })

    it('selects webgpu when the fake WebGPU run takes less time than the fake wasm run', async () => {
      vi.useFakeTimers()
      const wasm = await timedRun('wasm', 20_000)
      const webgpu = await timedRun('webgpu', 5_000)

      expect(pickDevice(true, { ...wasm, ...webgpu }, Date.now())).toBe('webgpu')
    })
  })
})
