import { describe, expect, it, vi } from 'vitest'
import type { StereoAudio } from '../protocol.ts'
import { SeparationFailure } from '../separationFailure.ts'
import { DEMUCS } from './demucsModel.ts'
import {
  type CreateDemucsProcessor,
  demucsDevices,
  demucsDoneSamples,
  demucsFailure,
  type DemucsProcessorLike,
  monoSum,
  monoVocals,
  runDemucs,
} from './demucsRun.ts'

const STRIDE = Math.floor(DEMUCS.segmentSamples * (1 - DEMUCS.overlap))

function stereo(length: number): StereoAudio {
  return {
    left: new Float32Array(length).fill(1),
    right: new Float32Array(length).fill(0),
    sampleRate: 44100,
  }
}

/** Returns a processor that reports two segments and gives the input as the vocals stem. */
function workingProcessor(onSegment: (segments: number) => void): DemucsProcessorLike {
  return {
    loadModel: vi.fn(async () => undefined),
    separate: async (left, right) => {
      onSegment(1)
      onSegment(2)
      const silent = { left: new Float32Array(left.length), right: new Float32Array(right.length) }
      return { vocals: { left, right }, drums: silent, bass: silent, other: silent }
    },
  }
}

function failingProcessor(error: unknown, step: 'load' | 'run'): DemucsProcessorLike {
  return {
    loadModel: async () => {
      if (step === 'load') throw error
    },
    separate: async () => {
      throw error
    },
  }
}

async function rejection(promise: Promise<unknown>): Promise<SeparationFailure> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SeparationFailure)) throw new Error('The call did not reject.')
  return error
}

describe('demucsDevices', () => {
  it('tries webgpu and then wasm when the browser gives an adapter', () => {
    expect(demucsDevices(true)).toEqual(['webgpu', 'wasm'])
  })

  it('uses wasm only when the browser gives no adapter', () => {
    expect(demucsDevices(false)).toEqual(['wasm'])
  })
})

describe('demucsDoneSamples', () => {
  it('gives 0 before the first segment', () => {
    expect(demucsDoneSamples(0, 10_000_000)).toBe(0)
  })

  it('gives the end of the last complete segment', () => {
    expect(demucsDoneSamples(1, 10_000_000)).toBe(DEMUCS.segmentSamples)
    expect(demucsDoneSamples(3, 10_000_000)).toBe(2 * STRIDE + DEMUCS.segmentSamples)
  })

  it('stops at the samples of the run', () => {
    expect(demucsDoneSamples(5, 400_000)).toBe(400_000)
  })
})

describe('monoVocals', () => {
  it('gives the mean of the two channels', () => {
    const mono = monoVocals(
      { left: new Float32Array([1, 0.5]), right: new Float32Array([0, -0.5]) },
      2,
    )

    expect(Array.from(mono)).toEqual([0.5, 0])
  })

  it('fails with the kind model for a stem with another length', () => {
    expect(() =>
      monoVocals({ left: new Float32Array(3), right: new Float32Array(3) }, 2),
    ).toThrowError(expect.objectContaining({ kind: 'model' }))
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'fails with the kind model for the sample %s',
    (value) => {
      expect(() =>
        monoVocals({ left: new Float32Array([0, value]), right: new Float32Array(2) }, 2),
      ).toThrowError(expect.objectContaining({ kind: 'model' }))
    },
  )
})

describe('monoSum', () => {
  const stem = (left: number[], right: number[]) => ({
    left: new Float32Array(left),
    right: new Float32Array(right),
  })

  it('gives the sum of the mean of the two channels of each stem', () => {
    const sum = monoSum([stem([1, 0], [0, 0]), stem([0.5, 0.25], [0.5, 0.25])], 2, 'stems')

    expect(Array.from(sum)).toEqual([1, 0.25])
  })

  it('names the result in the failure for a stem with another length', () => {
    expect(() => monoSum([stem([0, 0, 0], [0, 0, 0])], 2, 'instruments')).toThrowError(
      /Demucs instruments/,
    )
  })

  it('names the result in the failure for a value that is not finite', () => {
    expect(() => monoSum([stem([0, Number.NaN], [0, 0])], 2, 'instruments')).toThrowError(
      /Demucs instruments have a value that is not finite/,
    )
  })
})

describe('demucsFailure', () => {
  it.each<[unknown, 'load' | 'run', string]>([
    [
      new Error("Can't create a session. ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc"),
      'load',
      'memory',
    ],
    [new RangeError('Array buffer allocation failed'), 'run', 'memory'],
    [new Error('Out of memory'), 'run', 'memory'],
    [new Error('protobuf parsing failed'), 'load', 'model'],
    [new Error('Could not find time-domain output tensor'), 'run', 'unknown'],
  ])('maps %s in the step %s to the kind %s', (error, step, kind) => {
    expect(demucsFailure(error, step).kind).toBe(kind)
  })

  it('keeps the kind of a SeparationFailure', () => {
    const failure = new SeparationFailure('download', 'detail')

    expect(demucsFailure(failure, 'run')).toBe(failure)
  })
})

describe('runDemucs', () => {
  const model = new ArrayBuffer(8)

  it('loads the model, sends the progress as audio time, and returns the mono vocals', async () => {
    const audio = stereo(441_000)
    const progress = vi.fn()
    const create = vi.fn<CreateDemucsProcessor>((_device, onSegment) => workingProcessor(onSegment))

    const { vocals } = await runDemucs(
      model,
      audio,
      { download: vi.fn(), progress },
      ['wasm'],
      create,
    )

    expect(vocals).toHaveLength(441_000)
    expect(vocals[0]).toBe(0.5)
    expect(progress.mock.calls).toEqual([
      [0, 10_000],
      [(DEMUCS.segmentSamples / 44100) * 1000, 10_000],
      [10_000, 10_000],
    ])
    expect(create).toHaveBeenCalledExactlyOnceWith('wasm', expect.any(Function))
  })

  it('passes the model contents to loadModel', async () => {
    const made: DemucsProcessorLike[] = []
    await runDemucs(
      model,
      stereo(4),
      { download: vi.fn(), progress: vi.fn() },
      ['wasm'],
      (_device, onSegment) => {
        const processor = workingProcessor(onSegment)
        made.push(processor)
        return processor
      },
    )

    expect(made).toHaveLength(1)
    expect(made[0]?.loadModel).toHaveBeenCalledWith(model)
  })

  it('goes on with wasm after a webgpu failure', async () => {
    const devices: string[] = []
    const { vocals } = await runDemucs(
      model,
      stereo(4),
      { download: vi.fn(), progress: vi.fn() },
      ['webgpu', 'wasm'],
      (device, onSegment) => {
        devices.push(device)
        return device === 'webgpu'
          ? failingProcessor(new Error('no webgpu adapter'), 'load')
          : workingProcessor(onSegment)
      },
    )

    expect(devices).toEqual(['webgpu', 'wasm'])
    expect(vocals).toHaveLength(4)
  })

  it('returns the sum of the drums, bass and other stems as the instruments', async () => {
    const stem = (value: number) => ({
      left: new Float32Array(2).fill(value),
      right: new Float32Array(2).fill(value),
    })
    const processor: DemucsProcessorLike = {
      loadModel: async () => undefined,
      separate: async () => ({
        vocals: stem(1),
        drums: stem(0.25),
        bass: stem(0.5),
        other: stem(0.125),
      }),
    }

    const result = await runDemucs(
      model,
      stereo(2),
      { download: vi.fn(), progress: vi.fn() },
      ['wasm'],
      () => processor,
      true,
    )

    expect(Array.from(result.vocals)).toEqual([1, 1])
    expect(Array.from(result.instruments ?? [])).toEqual([0.875, 0.875])
  })

  it('returns no instruments field without the instruments flag', async () => {
    const result = await runDemucs(
      model,
      stereo(2),
      { download: vi.fn(), progress: vi.fn() },
      ['wasm'],
      (_device, onSegment) => workingProcessor(onSegment),
    )

    expect(result).not.toHaveProperty('instruments')
  })

  it('rejects with the kind memory when the last device fails with bad_alloc', async () => {
    const failure = await rejection(
      runDemucs(model, stereo(4), { download: vi.fn(), progress: vi.fn() }, ['wasm'], () =>
        failingProcessor(new Error('std::bad_alloc'), 'load'),
      ),
    )

    expect(failure.kind).toBe('memory')
  })

  it('rejects with the kind model when the model does not load', async () => {
    const failure = await rejection(
      runDemucs(model, stereo(4), { download: vi.fn(), progress: vi.fn() }, ['wasm'], () =>
        failingProcessor(new Error('invalid model'), 'load'),
      ),
    )

    expect(failure.kind).toBe('model')
  })

  it('rejects with the kind model when no device is given', async () => {
    const failure = await rejection(
      runDemucs(model, stereo(4), { download: vi.fn(), progress: vi.fn() }, [], vi.fn()),
    )

    expect(failure.kind).toBe('model')
  })
})
