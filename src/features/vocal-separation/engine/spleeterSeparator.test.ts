import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SeparationFailure } from '../separationFailure.ts'
import { SPLEETER } from './spleeterModel.ts'
import { createSpleeterSeparator } from './spleeterSeparator.ts'

/** The value that each fake session writes into every output sample. */
const output = vi.hoisted(() => ({ value: 1 }))

vi.mock('onnxruntime-web/ort-wasm-simd-threaded.wasm?url', () => ({ default: '/ort.wasm' }))
// A small transform keeps each test fast. The real 512 frames of a 4096-point FFT take about 1 s for each segment.
vi.mock('./spleeterModel.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./spleeterModel.ts')>()),
  SPLEETER: {
    fftSize: 64,
    hop: 16,
    frames: 32,
    modelBins: 32,
    overlap: 4 * 16,
    inputName: 'x',
    outputName: 'y',
  },
}))
vi.mock('./modelFiles.ts', () => ({
  loadModelFiles: async () => [new ArrayBuffer(1), new ArrayBuffer(1)],
}))
vi.mock('onnxruntime-web/wasm', () => {
  class Tensor {
    readonly data: Float32Array
    constructor(_type: string, data: Float32Array) {
      this.data = data
    }
  }
  const session = {
    run: async (feeds: Record<string, Tensor>) => {
      const input = Object.values(feeds)[0]
      return { y: { data: new Float32Array(input?.data.length ?? 0).fill(output.value) } }
    },
  }
  return {
    env: { wasm: {} },
    Tensor,
    InferenceSession: { create: async () => session },
  }
})

const events = { download: () => undefined, progress: () => undefined }
const audio = {
  left: new Float32Array(SPLEETER.fftSize * 2).fill(0.5),
  right: new Float32Array(SPLEETER.fftSize * 2).fill(0.5),
  sampleRate: 44100 as const,
}

describe('createSpleeterSeparator', () => {
  beforeEach(() => {
    output.value = 1
  })

  it('returns finite vocals with the length of the input', async () => {
    const vocals = await createSpleeterSeparator().separate(audio, events)
    expect(vocals).toHaveLength(audio.left.length)
    expect(vocals.every(Number.isFinite)).toBe(true)
  })

  it('fails with the kind model when the model gives NaN', async () => {
    output.value = Number.NaN
    const failure = createSpleeterSeparator().separate(audio, events)
    await expect(failure).rejects.toThrow(SeparationFailure)
    await expect(failure).rejects.toHaveProperty('kind', 'model')
  })

  it('fails with the kind model when the model gives Infinity', async () => {
    output.value = Number.POSITIVE_INFINITY
    await expect(createSpleeterSeparator().separate(audio, events)).rejects.toHaveProperty(
      'kind',
      'model',
    )
  })
})
