import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureSingerFinder, fixtureSegments } from './engine/fixtureSingerFinder.ts'
import { createSingerFinder } from './engine/index.ts'
import type { SingersMessage } from './protocol.ts'
import { SingerFailure, singerFailureKind } from './singerFailure.ts'
import type { SingerFinder } from './singerFinder.ts'
import { serveSingerFinder } from './serveSingerFinder.ts'

const vocals = new Float32Array([0.5, 0.25])

function serve(finder: SingerFinder) {
  const posted: SingersMessage[] = []
  const createEngine = vi.fn(() => finder)
  const handle = serveSingerFinder(createEngine, (message) => posted.push(message))
  return { handle, posted, createEngine }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('serveSingerFinder', () => {
  it('posts the progress of the engine and then the segments', async () => {
    const segments = [{ startMs: 0, endMs: 100, singer: 0 }]
    const { handle, posted } = serve({
      find: async (_vocals, on) => {
        on.download(1, 2)
        on.progress(3, 4)
        return segments
      },
    })

    await handle({ type: 'find-singers', runId: 7, vocals })

    expect(posted).toEqual([
      { type: 'download', runId: 7, loadedBytes: 1, totalBytes: 2 },
      { type: 'progress', runId: 7, doneMs: 3, totalMs: 4 },
      { type: 'result', runId: 7, segments },
    ])
  })

  it('makes the engine at the first request and keeps it for the next request', async () => {
    const { handle, createEngine } = serve({ find: async () => [] })

    await handle({ type: 'find-singers', runId: 1, vocals })
    await handle({ type: 'find-singers', runId: 2, vocals })

    expect(createEngine).toHaveBeenCalledTimes(1)
  })

  it('ignores a message that is not a request', async () => {
    const { handle, posted, createEngine } = serve({ find: async () => [] })

    await handle({ cmd: 'thread' })
    await handle(null)

    expect(posted).toEqual([])
    expect(createEngine).not.toHaveBeenCalled()
  })

  it('posts the kind of the failure of the engine', async () => {
    const { handle, posted } = serve({
      find: () => Promise.reject(new SingerFailure('download', 'HTTP 404')),
    })

    await handle({ type: 'find-singers', runId: 3, vocals })

    expect(posted).toEqual([
      { type: 'error', runId: 3, kind: 'download', detail: 'SingerFailure: HTTP 404' },
    ])
  })

  it('posts the kind unknown when the engine cannot start', async () => {
    const posted: SingersMessage[] = []
    const handle = serveSingerFinder(
      () => {
        throw new Error('no WebAssembly')
      },
      (message) => posted.push(message),
    )

    await handle({ type: 'find-singers', runId: 4, vocals })

    expect(posted).toEqual([
      { type: 'error', runId: 4, kind: 'unknown', detail: 'Error: no WebAssembly' },
    ])
  })
})

describe('singerFailureKind', () => {
  it.each([
    ['a SingerFailure keeps its kind', new SingerFailure('model', 'bad graph'), 'model'],
    ['a RangeError gives memory', new RangeError('Array buffer allocation failed'), 'memory'],
    ['a memory text gives memory', new Error('Aborted(): out of memory'), 'memory'],
    ['any other error gives unknown', new Error('boom'), 'unknown'],
  ])('%s', (_name, error, kind) => {
    expect(singerFailureKind(error)).toBe(kind)
  })
})

describe('createFixtureSingerFinder', () => {
  it('sends the download, then the progress to the end of the vocals, and returns two singers', async () => {
    vi.useFakeTimers()
    const download = vi.fn()
    const progress = vi.fn()

    const result = createFixtureSingerFinder().find(new Float32Array(16_000 * 4), {
      download,
      progress,
    })
    await vi.runAllTimersAsync()

    expect(await result).toEqual(fixtureSegments(4000))
    expect(download).toHaveBeenLastCalledWith(3_000_000, 3_000_000)
    expect(progress).toHaveBeenNthCalledWith(1, 0, 4000)
    expect(progress).toHaveBeenLastCalledWith(4000, 4000)
  })

  it('is the engine of the seam until the real engine exists', () => {
    expect(typeof createSingerFinder().find).toBe('function')
  })
})

describe('fixtureSegments', () => {
  it('gives singer 0 the first half and singer 1 the second half, with 500 ms in common', () => {
    expect(fixtureSegments(10_000)).toEqual([
      { startMs: 0, endMs: 5250, singer: 0 },
      { startMs: 4750, endMs: 10_000, singer: 1 },
    ])
  })
})
