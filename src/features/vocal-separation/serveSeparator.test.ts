import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureSeparator, monoMix } from './engine/fixtureSeparator.ts'
import type { SeparateMessage, SeparationModelId, StereoAudio } from './protocol.ts'
import { SeparationFailure, separationFailureKind } from './separationFailure.ts'
import type { Separator } from './separator.ts'
import { serveSeparator } from './serveSeparator.ts'

const audio: StereoAudio = {
  left: new Float32Array([1, 0, 0.5]),
  right: new Float32Array([0, 1, 0.5]),
  sampleRate: 44100,
}

function serve(separator: Separator) {
  const posted: { message: SeparateMessage; transfer?: Transferable[] }[] = []
  const createEngine = vi.fn<(model: SeparationModelId) => Separator>(() => separator)
  const handle = serveSeparator(createEngine, (message, transfer) =>
    posted.push({ message, transfer }),
  )
  return { handle, posted, createEngine }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('serveSeparator', () => {
  it('posts the progress of the engine and then the vocals with their buffer transferred', async () => {
    const vocals = new Float32Array([0.5])
    const { handle, posted } = serve({
      separate: async (_audio, on) => {
        on.download(1, 2)
        on.progress(3, 4)
        return { vocals }
      },
    })

    await handle({ type: 'separate', runId: 7, audio })

    expect(posted).toEqual([
      { message: { type: 'download', runId: 7, loadedBytes: 1, totalBytes: 2 } },
      { message: { type: 'progress', runId: 7, doneMs: 3, totalMs: 4 } },
      { message: { type: 'result', runId: 7, vocals }, transfer: [vocals.buffer] },
    ])
  })

  it('passes the instruments flag to the engine and posts the instruments with their buffer transferred', async () => {
    const vocals = new Float32Array([0.5])
    const instruments = new Float32Array([0.25])
    const separate = vi.fn<Separator['separate']>(async () => ({ vocals, instruments }))
    const { handle, posted } = serve({ separate })

    await handle({ type: 'separate', runId: 8, audio, instruments: true })

    expect(separate).toHaveBeenCalledWith(audio, expect.anything(), true)
    expect(posted).toEqual([
      {
        message: { type: 'result', runId: 8, vocals, instruments },
        transfer: [vocals.buffer, instruments.buffer],
      },
    ])
  })

  it('passes false to the engine for a request with no instruments flag', async () => {
    const separate = vi.fn<Separator['separate']>(async () => ({ vocals: new Float32Array(1) }))
    const { handle } = serve({ separate })

    await handle({ type: 'separate', runId: 9, audio })

    expect(separate).toHaveBeenCalledWith(audio, expect.anything(), false)
  })

  it('makes the engine at the first request and keeps it for the next request', async () => {
    const { handle, createEngine } = serve({
      separate: async () => ({ vocals: new Float32Array(1) }),
    })

    await handle({ type: 'separate', runId: 1, audio })
    await handle({ type: 'separate', runId: 2, audio })

    expect(createEngine).toHaveBeenCalledTimes(1)
  })

  it('makes the engine of the model of the request', async () => {
    const { handle, createEngine } = serve({
      separate: async () => ({ vocals: new Float32Array(1) }),
    })

    await handle({ type: 'separate', runId: 1, audio, model: 'demucs' })

    expect(createEngine).toHaveBeenCalledExactlyOnceWith('demucs')
  })

  it('makes the Spleeter engine for a request with no model', async () => {
    const { handle, createEngine } = serve({
      separate: async () => ({ vocals: new Float32Array(1) }),
    })

    await handle({ type: 'separate', runId: 1, audio })

    expect(createEngine).toHaveBeenCalledExactlyOnceWith('spleeter')
  })

  it('ignores a message that is not a request', async () => {
    const { handle, posted, createEngine } = serve({
      separate: async () => ({ vocals: new Float32Array(1) }),
    })

    await handle({ cmd: 'thread' })
    await handle(null)

    expect(posted).toEqual([])
    expect(createEngine).not.toHaveBeenCalled()
  })

  it('posts the kind of the failure of the engine', async () => {
    const { handle, posted } = serve({
      separate: () => Promise.reject(new SeparationFailure('download', 'HTTP 404')),
    })

    await handle({ type: 'separate', runId: 3, audio })

    expect(posted).toEqual([
      {
        message: {
          type: 'error',
          runId: 3,
          kind: 'download',
          detail: 'SeparationFailure: HTTP 404',
        },
      },
    ])
  })

  it('posts the kind unknown when the engine cannot start', async () => {
    const handle = serveSeparator(
      () => {
        throw new Error('no WebAssembly')
      },
      (message) => posted.push(message),
    )
    const posted: SeparateMessage[] = []

    await handle({ type: 'separate', runId: 4, audio })

    expect(posted).toEqual([
      { type: 'error', runId: 4, kind: 'unknown', detail: 'Error: no WebAssembly' },
    ])
  })
})

describe('separationFailureKind', () => {
  it.each([
    ['a SeparationFailure keeps its kind', new SeparationFailure('model', 'bad graph'), 'model'],
    ['a RangeError gives memory', new RangeError('Array buffer allocation failed'), 'memory'],
    ['a memory text gives memory', new Error('Aborted(): out of memory'), 'memory'],
    ['any other error gives unknown', new Error('boom'), 'unknown'],
    ['a value that is not an error gives unknown', 'boom', 'unknown'],
  ])('%s', (_name, error, kind) => {
    expect(separationFailureKind(error)).toBe(kind)
  })
})

describe('createFixtureSeparator', () => {
  it('sends the download, then the progress to the end of the audio, and returns the mono mix', async () => {
    vi.useFakeTimers()
    const download = vi.fn()
    const progress = vi.fn()
    const long: StereoAudio = {
      left: new Float32Array(44_100).fill(1),
      right: new Float32Array(44_100),
      sampleRate: 44100,
    }

    const result = createFixtureSeparator().separate(long, { download, progress }, false)
    await vi.runAllTimersAsync()

    expect((await result).vocals).toEqual(new Float32Array(44_100).fill(0.5))
    expect(download).toHaveBeenLastCalledWith(2_000_000, 2_000_000)
    expect(progress).toHaveBeenNthCalledWith(1, 0, 1000)
    expect(progress).toHaveBeenLastCalledWith(1000, 1000)
    expect(progress.mock.calls.length).toBeGreaterThan(2)
  })
})

describe('monoMix', () => {
  it('returns the mean of the two channels for each sample', () => {
    expect(monoMix(audio)).toEqual(new Float32Array([0.5, 0.5, 0.5]))
  })
})
