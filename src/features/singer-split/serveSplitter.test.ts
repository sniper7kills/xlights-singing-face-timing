import { describe, expect, it, vi } from 'vitest'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import { createFixtureSplitter } from './engine/fixtureSplitter.ts'
import { createSplitter } from './engine/index.ts'
import type { SplitMessage } from './protocol.ts'
import { serveSplitter } from './serveSplitter.ts'
import { SplitFailure, splitFailureKind } from './splitFailure.ts'
import type { Splitter } from './splitter.ts'

const vocals: StereoAudio = {
  left: new Float32Array([1, 0, 0.5]),
  right: new Float32Array([0, 1, 0.5]),
  sampleRate: 44100,
}

function serve(splitter: Splitter) {
  const posted: { message: SplitMessage; transfer?: Transferable[] }[] = []
  const createEngine = vi.fn(() => splitter)
  const handle = serveSplitter(createEngine, (message, transfer) =>
    posted.push({ message, transfer }),
  )
  return { handle, posted, createEngine }
}

describe('serveSplitter', () => {
  it('posts the progress of the engine and then the tracks with their buffers transferred', async () => {
    const audio: StereoAudio = {
      left: new Float32Array([0.5]),
      right: new Float32Array([0.25]),
      sampleRate: 44100,
    }
    const { handle, posted } = serve({
      split: async (_vocals, _mode, on) => {
        on.download(1, 2)
        on.progress(3, 4)
        return { tracks: [{ label: 'lead', audio }] }
      },
    })

    await handle({ type: 'split', runId: 7, vocals, mode: 'lead-backing' })

    expect(posted).toEqual([
      { message: { type: 'download', runId: 7, loadedBytes: 1, totalBytes: 2 } },
      { message: { type: 'progress', runId: 7, doneMs: 3, totalMs: 4 } },
      {
        message: { type: 'result', runId: 7, tracks: [{ label: 'lead', audio }] },
        transfer: [audio.left.buffer, audio.right.buffer],
      },
    ])
  })

  it('posts the kind of a failure of the engine', async () => {
    const { handle, posted } = serve(createSplitter())

    await handle({ type: 'split', runId: 2, vocals, mode: 'male-female' })

    expect(posted[0]?.message).toMatchObject({ type: 'error', runId: 2, kind: 'not-available' })
  })

  it('aborts the signal of the run that a cancel message names', async () => {
    let signal: AbortSignal | undefined
    let finish: () => void = () => undefined
    const { handle } = serve({
      split: (_vocals, _mode, _on, runSignal) => {
        signal = runSignal
        return new Promise((resolve) => {
          finish = () => resolve({ tracks: [] })
        })
      },
    })

    const running = handle({ type: 'split', runId: 3, vocals, mode: 'male-female' })
    await handle({ type: 'cancel', runId: 3 })

    expect(signal?.aborted).toBe(true)
    finish()
    await running
  })

  it('makes the engine one time and ignores a message that is not a request', async () => {
    const { handle, createEngine, posted } = serve({ split: async () => ({ tracks: [] }) })

    await handle({ type: 'other' })
    await handle(null)
    await handle({ type: 'split', runId: 1, vocals, mode: 'male-female' })
    await handle({ type: 'split', runId: 2, vocals, mode: 'male-female' })

    expect(createEngine).toHaveBeenCalledTimes(1)
    expect(posted).toHaveLength(2)
  })
})

describe('splitFailureKind', () => {
  it('keeps the kind of a split failure, and reads a memory failure from its text', () => {
    expect(splitFailureKind(new SplitFailure('download', 'x'))).toBe('download')
    expect(splitFailureKind(new Error('out of memory'))).toBe('memory')
    expect(splitFailureKind('other')).toBe('unknown')
  })
})

describe('createFixtureSplitter', () => {
  it('gives two tracks with the labels of the mode, each with its own part of the vocals', async () => {
    vi.useFakeTimers()
    const long: StereoAudio = {
      left: new Float32Array(10).fill(1),
      right: new Float32Array(10).fill(1),
      sampleRate: 44100,
    }
    const on = { download: vi.fn(), progress: vi.fn() }

    const result = createFixtureSplitter().split(
      long,
      'male-female',
      on,
      new AbortController().signal,
    )
    await vi.runAllTimersAsync()
    const { tracks } = await result
    vi.useRealTimers()

    expect(tracks.map((track) => track.label)).toEqual(['female', 'male'])
    expect([...(tracks[0]?.audio.left ?? [])]).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0])
    expect([...(tracks[1]?.audio.right ?? [])]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
    expect(on.progress).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number))
  })

  it('stops when the signal aborts', async () => {
    const controller = new AbortController()
    controller.abort()

    vi.useFakeTimers()
    const result = createFixtureSplitter().split(
      vocals,
      'lead-backing',
      { download: vi.fn(), progress: vi.fn() },
      controller.signal,
    )
    const settled = expect(result).rejects.toBeInstanceOf(SplitFailure)
    await vi.runAllTimersAsync()
    await settled
    vi.useRealTimers()
  })
})
