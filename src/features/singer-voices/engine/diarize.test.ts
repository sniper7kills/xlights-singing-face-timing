import { describe, expect, it, vi } from 'vitest'
import { diarize, type DiarizeModels } from './diarize.ts'

const FRAME = 100
const settings = {
  sampleRate: 1000,
  windowSamples: 1000,
  stepSamples: 500,
  minEmbedSamples: 200,
  threshold: 0.5,
  minGroupSize: 1,
  maxSingers: 12,
  minGapMs: 0,
  minRangeMs: 0,
}

function mean(samples: Float32Array): number {
  return samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)
}

/**
 * Returns fake models for audio in which the value 1 is one singer, -1 is a second singer, and 2 is both.
 * The fake segmentation gives the local speaker numbers in a different order in each next window,
 * as the real model can, so only the embeddings can join them.
 */
function fakeModels(): DiarizeModels {
  let windowCount = 0
  return {
    async segment(window) {
      const swap = windowCount++ % 2 === 1
      const logits = new Float32Array((window.length / FRAME) * 7).fill(-5)
      for (let frame = 0; frame < window.length / FRAME; frame++) {
        const value = mean(window.subarray(frame * FRAME, (frame + 1) * FRAME))
        const single = (value > 0.5) !== swap ? 1 : 2
        const winner = value > 1.5 ? 4 : Math.abs(value) > 0.5 ? single : 0
        logits[frame * 7 + winner] = 3
      }
      return logits
    },
    // The samples of both singers at once tell neither voice, as for a real embedding of a mix.
    async embed(samples) {
      const first = samples.filter((value) => value === 1).length
      const second = samples.filter((value) => value === -1).length
      if (first === 0 && second === 0) return Float32Array.from([1, 1])
      return first >= second ? Float32Array.from([1, 0]) : Float32Array.from([0, 1])
    },
  }
}

function audio(...parts: [value: number, samples: number][]): Float32Array {
  return Float32Array.from(parts.flatMap(([value, samples]) => Array<number>(samples).fill(value)))
}

describe('diarize', () => {
  it('gives the same singer number to one voice in all windows', async () => {
    const ranges = await diarize(audio([-1, 1500], [1, 1500]), fakeModels(), settings, () => {})
    expect(ranges).toEqual([
      { startMs: 0, endMs: 1500, singer: 0 },
      { startMs: 1500, endMs: 3000, singer: 1 },
    ])
  })

  it('numbers the singers in the order of their first range', async () => {
    const ranges = await diarize(
      audio([1, 1000], [-1, 1000], [1, 1000]),
      fakeModels(),
      settings,
      () => {},
    )
    expect(ranges.map((range) => range.singer)).toEqual([0, 1, 0])
  })

  it('gives no range to silence', async () => {
    const ranges = await diarize(audio([0, 500], [1, 2000], [0, 500]), fakeModels(), settings, () => {})
    expect(ranges).toEqual([{ startMs: 500, endMs: 2500, singer: 0 }])
  })

  it('gives an empty list for audio with no voice', async () => {
    expect(await diarize(audio([0, 3000]), fakeModels(), settings, () => {})).toEqual([])
  })

  it('reports the samples done after each window', async () => {
    const onProgress = vi.fn()
    await diarize(audio([1, 2000]), fakeModels(), settings, onProgress)
    expect(onProgress.mock.calls).toEqual([
      [1000, 2000],
      [1500, 2000],
      [2000, 2000],
    ])
  })

  it('reads audio shorter than one window as one padded window', async () => {
    const ranges = await diarize(audio([1, 600]), fakeModels(), settings, () => {})
    expect(ranges).toEqual([{ startMs: 0, endMs: 600, singer: 0 }])
  })

  it('gives overlapping ranges to two singers who sing together', async () => {
    // Each window that holds the overlap also holds at least 500 samples of one singer alone.
    const ranges = await diarize(
      audio([1, 1500], [2, 500], [-1, 1000]),
      fakeModels(),
      { ...settings, minEmbedSamples: 600 },
      () => {},
    )
    expect(ranges).toEqual([
      { startMs: 0, endMs: 2000, singer: 0 },
      { startMs: 1500, endMs: 3000, singer: 1 },
    ])
  })

  it('rejects with the error of a model call', async () => {
    const models = { ...fakeModels(), segment: () => Promise.reject(new Error('no session')) }
    await expect(diarize(audio([1, 1000]), models, settings, () => {})).rejects.toThrow('no session')
  })
})
