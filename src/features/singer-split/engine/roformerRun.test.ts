import { describe, expect, it, vi } from 'vitest'
import type { SplitMode } from '../protocol.ts'
import { SplitFailure } from '../splitFailure.ts'
import type { SplitModel } from '../splitModels.ts'
import {
  runRoformerSplit,
  runtimeFailure,
  type SessionLike,
  type SplitRuntime,
  type TensorLike,
} from './roformerRun.ts'
import { BINS } from './roformerSignal.ts'

/** A small model: chunks of 4410 samples (11 frames), so a fake run is fast. */
function smallModel(stems: SplitModel['stems']): SplitModel {
  return { fileName: 'small.onnx', bytes: 3, sha256: '', chunkSamples: 4410, frames: 11, stems }
}

type FakeTensor = TensorLike & { disposed: boolean }

function fakeTensor(data: unknown, dims: readonly number[]): FakeTensor {
  const tensor: FakeTensor = {
    dims,
    data,
    disposed: false,
    dispose: () => {
      tensor.disposed = true
    },
  }
  return tensor
}

type Options = {
  /** Makes the output of each run from the input data. The default gives stem 0 = the input and stem 1 = 0. */
  output?: (input: Float32Array) => FakeTensor
  /** The rejection of `run`. */
  runError?: unknown
  /** The rejection of `createSession`. */
  createError?: unknown
  /** Called after each run. */
  afterRun?: (runs: number) => void
}

/** A runtime with a fake session that records its tensors, its runs and its release. */
function fakeRuntime(options: Options = {}) {
  const tensors: FakeTensor[] = []
  const state = { runs: 0, released: 0 }
  const frames = 11
  const defaultOutput = (input: Float32Array) => {
    const data = new Float32Array(input.length * 2)
    data.set(input)
    return fakeTensor(data, [1, 2, 2, BINS, frames, 2])
  }
  const session: SessionLike<FakeTensor> = {
    async run(feeds) {
      if (options.runError !== undefined) throw options.runError
      state.runs += 1
      const input = feeds.spec?.data
      if (!(input instanceof Float32Array)) throw new Error('no input')
      const out = (options.output ?? defaultOutput)(input)
      tensors.push(out)
      options.afterRun?.(state.runs)
      return { out }
    },
    async release() {
      state.released += 1
    },
  }
  const runtime: SplitRuntime<FakeTensor> = {
    loadModel: vi.fn(async (_model, onDownload) => {
      onDownload(3, 3)
      return new ArrayBuffer(3)
    }),
    createSession: vi.fn(async () => {
      if (options.createError !== undefined) throw options.createError
      return session
    }),
    tensor: (data, dims) => {
      const tensor = fakeTensor(data, dims)
      tensors.push(tensor)
      return tensor
    },
  }
  return { runtime, tensors, state }
}

function vocalsOf(length: number) {
  const left = Float32Array.from({ length }, (_, index) => Math.sin(index * 0.05) * 0.2)
  const right = Float32Array.from({ length }, (_, index) => Math.cos(index * 0.03) * 0.1)
  return { left, right, sampleRate: 44100 as const }
}

const events = () => ({ download: vi.fn(), progress: vi.fn() })

function run(
  runtime: SplitRuntime<FakeTensor>,
  model: SplitModel,
  mode: SplitMode = 'male-female',
  length = 12_000,
  signal = new AbortController().signal,
  on = events(),
) {
  return runRoformerSplit(runtime, model, vocalsOf(length), mode, on, signal)
}

function maxDifference(actual: Float32Array, expected: Float32Array): number {
  return actual.reduce(
    (max, value, index) => Math.max(max, Math.abs(value - (expected[index] ?? 0))),
    0,
  )
}

describe('runRoformerSplit', () => {
  it('returns the male and female tracks in label order, female first, with the input length', async () => {
    const { runtime } = fakeRuntime()
    const vocals = vocalsOf(12_000)
    const result = await runRoformerSplit(
      runtime,
      smallModel(['male', 'female']),
      vocals,
      'male-female',
      events(),
      new AbortController().signal,
    )
    expect(result.tracks.map((track) => track.label)).toEqual(['female', 'male'])
    const [female, male] = result.tracks
    // The fake session puts the input in stem 0, the male stem, and 0 in stem 1.
    expect(male?.audio.left).toHaveLength(12_000)
    expect(maxDifference(male?.audio.left ?? new Float32Array(), vocals.left)).toBeLessThan(1e-5)
    expect(maxDifference(male?.audio.right ?? new Float32Array(), vocals.right)).toBeLessThan(1e-5)
    expect(Math.max(...(female?.audio.left ?? []).map(Math.abs))).toBe(0)
    expect(male?.audio.sampleRate).toBe(44100)
  })

  it('returns the lead track from stem 0 and the backing track from stem 1', async () => {
    const { runtime } = fakeRuntime()
    const result = await run(runtime, smallModel(['lead', 'backing']), 'lead-backing')
    expect(result.tracks.map((track) => track.label)).toEqual(['lead', 'backing'])
    expect(Math.max(...(result.tracks[0]?.audio.left ?? []).map(Math.abs))).toBeGreaterThan(0.1)
    expect(Math.max(...(result.tracks[1]?.audio.left ?? []).map(Math.abs))).toBe(0)
  })

  it('pads an input shorter than one chunk and returns tracks with the input length', async () => {
    const { runtime, state } = fakeRuntime()
    const result = await run(runtime, smallModel(['male', 'female']), 'male-female', 1500)
    expect(state.runs).toBe(1)
    expect(result.tracks[0]?.audio.left).toHaveLength(1500)
  })

  it('reports the download, then the progress after each chunk until the end', async () => {
    const { runtime } = fakeRuntime()
    const on = events()
    await run(runtime, smallModel(['male', 'female']), 'male-female', 12_000, undefined, on)
    expect(on.download).toHaveBeenCalledWith(3, 3)
    const totalMs = (12_000 / 44_100) * 1000
    // Five chunks start at 0, 2205, 4410, 6615 and 7590.
    expect(on.progress.mock.calls.map(([doneMs]) => Math.round(doneMs))).toEqual(
      [0, 4410, 6615, 8820, 11_025, 12_000].map((samples) => Math.round((samples / 44_100) * 1000)),
    )
    expect(on.progress).toHaveBeenLastCalledWith(totalMs, totalMs)
  })

  it('disposes the input and the output tensor of each chunk and releases the session at the end', async () => {
    const { runtime, tensors, state } = fakeRuntime()
    await run(runtime, smallModel(['male', 'female']))
    expect(tensors).toHaveLength(10)
    expect(tensors.every((tensor) => tensor.disposed)).toBe(true)
    expect(state.released).toBe(1)
  })

  it('stops between chunks when the signal aborts, and releases the session', async () => {
    const controller = new AbortController()
    const { runtime, state } = fakeRuntime({
      afterRun: (runs) => {
        if (runs === 2) controller.abort()
      },
    })
    const failure = run(
      runtime,
      smallModel(['male', 'female']),
      'male-female',
      12_000,
      controller.signal,
    )
    await expect(failure).rejects.toThrow(SplitFailure)
    expect(state.runs).toBe(2)
    expect(state.released).toBe(1)
  })

  it('starts no session when the signal aborts during the download', async () => {
    const controller = new AbortController()
    const { runtime } = fakeRuntime()
    runtime.loadModel = async () => {
      controller.abort()
      return new ArrayBuffer(3)
    }
    await expect(
      run(runtime, smallModel(['male', 'female']), 'male-female', 12_000, controller.signal),
    ).rejects.toThrow(SplitFailure)
    expect(runtime.createSession).not.toHaveBeenCalled()
  })

  it('fails with the kind model for an output with a wrong shape, and releases the session', async () => {
    const { runtime, state, tensors } = fakeRuntime({
      output: () => fakeTensor(new Float32Array(10), [1, 2, 1025, 11, 2]),
    })
    const failure = run(runtime, smallModel(['male', 'female']))
    await expect(failure).rejects.toHaveProperty('kind', 'model')
    await expect(failure).rejects.toThrow('the shape [1, 2, 1025, 11, 2]')
    expect(state.released).toBe(1)
    expect(tensors.every((tensor) => tensor.disposed)).toBe(true)
  })

  it('fails with the kind memory for a lost GPU device in a chunk, and releases the session', async () => {
    const { runtime, state } = fakeRuntime({ runError: new Error('GPU device was lost') })
    await expect(run(runtime, smallModel(['male', 'female']))).rejects.toHaveProperty(
      'kind',
      'memory',
    )
    expect(state.released).toBe(1)
  })

  it('fails with the kind not-available when the session gets no WebGPU adapter', async () => {
    const { runtime, state } = fakeRuntime({
      createError: new Error(
        'no available backend found. ERR: [webgpu] Error: Failed to get GPU adapter.',
      ),
    })
    await expect(run(runtime, smallModel(['male', 'female']))).rejects.toHaveProperty(
      'kind',
      'not-available',
    )
    expect(state.released).toBe(0)
  })

  it('keeps the kind download of a failed model download', async () => {
    const { runtime } = fakeRuntime()
    runtime.loadModel = async () => {
      throw new SplitFailure('download', 'models/small.onnx has 2 bytes, not 3.')
    }
    await expect(run(runtime, smallModel(['male', 'female']))).rejects.toHaveProperty(
      'kind',
      'download',
    )
  })
})

describe('runtimeFailure', () => {
  it.each([
    ['WebGPU is not supported in current environment', 'load', 'not-available'],
    ['Failed to get GPU adapter.', 'load', 'not-available'],
    ['std::bad_alloc', 'load', 'memory'],
    [
      'failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: shader_helper.cc:308 numbers_storage_buffers_ <= limits_.maxStorageBuffersPerShaderStage was false. Too many storage buffers in shader. Current: 17, Max is 16',
      'run',
      'not-available',
    ],
    ['Out of memory', 'run', 'memory'],
    ['Device is lost', 'run', 'memory'],
    ['Unsupported model IR version', 'load', 'model'],
    ['Something else', 'run', 'unknown'],
  ] as const)('maps "%s" at %s to %s', (text, step, kind) => {
    expect(runtimeFailure(new Error(text), step).kind).toBe(kind)
  })

  it('maps a RangeError to memory', () => {
    expect(runtimeFailure(new RangeError('Array buffer allocation failed'), 'load').kind).toBe(
      'memory',
    )
  })

  it('keeps a SplitFailure as it is', () => {
    const failure = new SplitFailure('model', 'x')
    expect(runtimeFailure(failure, 'run')).toBe(failure)
  })
})
