import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BINS,
  chunkStarts,
  createOverlapAdd,
  createRoformerStft,
  fadeWindow,
  inputIndex,
  outputIndex,
} from './roformerSignal.ts'

// The fixtures come from scripts/make-singer-split-fixtures.py, with reference.py of issue #191 as the ground truth.
// jsdom gives `import.meta.url` an http scheme, so the path starts at the project folder where Vitest runs.
const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'singer-split')
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as {
  chunk: number
  overlap: number
  length: number
  short: number
}

function fixture(name: string): Float32Array {
  const bytes = readFileSync(join(FIXTURES, name))
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

function maxDifference(actual: ArrayLike<number>, expected: ArrayLike<number>): number {
  expect(actual.length).toBe(expected.length)
  let max = 0
  for (let index = 0; index < expected.length; index++)
    max = Math.max(max, Math.abs((actual[index] ?? 0) - (expected[index] ?? 0)))
  return max
}

/** The two channels of a fixture input `(2, length)`, cut to `length` samples. */
function channelsOf(input: Float32Array, length: number): [Float32Array, Float32Array] {
  const size = input.length / 2
  return [input.slice(0, length), input.slice(size, size + length)]
}

/**
 * Returns the output tensor of the fake session of the fixture script:
 * stem 0 is the input times bin / 1024, stem 1 is the input times 0.5j.
 */
function gainOutput(input: Float32Array, frames: number): Float32Array {
  const output = new Float32Array(input.length * 2)
  for (let channel = 0; channel < 2; channel++) {
    for (let bin = 0; bin < BINS; bin++) {
      for (let frame = 0; frame < frames; frame++) {
        const real = input[inputIndex(channel, bin, frame, 0, frames)] ?? 0
        const imag = input[inputIndex(channel, bin, frame, 1, frames)] ?? 0
        const gain = bin / 1024
        output[outputIndex(0, channel, bin, frame, 0, frames)] = real * gain
        output[outputIndex(0, channel, bin, frame, 1, frames)] = imag * gain
        output[outputIndex(1, channel, bin, frame, 0, frames)] = -0.5 * imag
        output[outputIndex(1, channel, bin, frame, 1, frames)] = 0.5 * real
      }
    }
  }
  return output
}

/** Runs the signal path of the engine with the gain session, as `separate()` of reference.py does. */
function separateWithGains(channels: [Float32Array, Float32Array]): Float32Array[][] {
  const { chunk, overlap } = manifest
  const length = channels[0].length
  const stft = createRoformerStft(chunk)
  const sum = createOverlapAdd(length, fadeWindow(chunk))
  const input = new Float32Array(2 * BINS * stft.frames * 2)
  for (const start of chunkStarts(length, chunk, Math.floor(chunk / overlap))) {
    const part = channels.map((channel) => {
      const samples = new Float32Array(chunk)
      samples.set(channel.subarray(start, start + chunk))
      return samples
    })
    stft.forward([part[0] ?? new Float32Array(chunk), part[1] ?? new Float32Array(chunk)], input)
    const output = gainOutput(input, stft.frames)
    const stems = [0, 1].map((stem) => [0, 1].map((channel) => stft.inverse(output, stem, channel)))
    sum.add(stems, start, Math.min(chunk, length - start))
  }
  return sum.finish()
}

function flat(stems: Float32Array[][]): Float32Array {
  return Float32Array.from(stems.flatMap((channels) => channels.flatMap((values) => [...values])))
}

describe('the tensor index formulas', () => {
  it('gives the row-major index of the input shape [1, 2, 1025, T, 2]', () => {
    expect(inputIndex(0, 0, 0, 0, 801)).toBe(0)
    expect(inputIndex(0, 0, 0, 1, 801)).toBe(1)
    expect(inputIndex(0, 0, 1, 0, 801)).toBe(2)
    expect(inputIndex(0, 1, 0, 0, 801)).toBe(801 * 2)
    expect(inputIndex(1, 0, 0, 0, 801)).toBe(1025 * 801 * 2)
    expect(inputIndex(1, 1024, 800, 1, 801)).toBe(2 * 1025 * 801 * 2 - 1)
  })

  it('gives the row-major index of the output shape [1, 2, 2, 1025, T, 2]', () => {
    expect(outputIndex(0, 1, 0, 0, 0, 1101)).toBe(1025 * 1101 * 2)
    expect(outputIndex(1, 0, 0, 0, 0, 1101)).toBe(2 * 1025 * 1101 * 2)
    expect(outputIndex(1, 1, 1024, 1100, 1, 1101)).toBe(4 * 1025 * 1101 * 2 - 1)
  })
})

describe('createRoformerStft', () => {
  it('gives 801 frames for the male and female chunk and 1101 for the lead and backing chunk', () => {
    expect(createRoformerStft(352_800).frames).toBe(801)
    expect(createRoformerStft(485_100).frames).toBe(1101)
  })

  it('rejects a chunk length that is not a multiple of 441', () => {
    expect(() => createRoformerStft(4400)).toThrow(RangeError)
  })

  for (const kind of ['bs', 'mel']) {
    it(`fills the input tensor with the values of reference.py for the ${kind} test vector`, () => {
      const stft = createRoformerStft(manifest.chunk)
      const input = new Float32Array(2 * BINS * stft.frames * 2)
      stft.forward(channelsOf(fixture(`${kind}-input.f32`), manifest.chunk), input)
      expect(maxDifference(input, fixture(`${kind}-spec.f32`))).toBeLessThan(1e-4)
    })
  }

  it('gives back the input chunk of the male and female length through an identity model', () => {
    const chunk = 352_800
    const stft = createRoformerStft(chunk)
    const left = Float32Array.from({ length: chunk }, (_, index) => Math.sin(index * 0.01) * 0.3)
    const right = Float32Array.from({ length: chunk }, (_, index) => ((index * 7919) % 101) / 500)
    const input = new Float32Array(2 * BINS * stft.frames * 2)
    stft.forward([left, right], input)
    // The identity model gives the input spectrogram as each of the two stems.
    const output = new Float32Array(input.length * 2)
    output.set(input, 0)
    output.set(input, input.length)
    for (const stem of [0, 1]) {
      expect(maxDifference(stft.inverse(output, stem, 0), left)).toBeLessThan(1e-5)
      expect(maxDifference(stft.inverse(output, stem, 1), right)).toBeLessThan(1e-5)
    }
  })
})

describe('chunkStarts', () => {
  it('gives one chunk at 0 for a song shorter than one chunk', () => {
    expect(chunkStarts(3000, 4410, 2205)).toEqual([0])
  })

  it('gives one chunk for a song of exactly one chunk', () => {
    expect(chunkStarts(4410, 4410, 2205)).toEqual([0])
  })

  it('gives the starts with the step for a song of an exact multiple of the step', () => {
    expect(chunkStarts(8820, 4410, 2205)).toEqual([0, 2205, 4410])
  })

  it('moves the last chunk to the end of a long song', () => {
    expect(chunkStarts(12_000, 4410, 2205)).toEqual([0, 2205, 4410, 6615, 7590])
  })

  it('gives the chunk counts of reference.py for a 3 minute song', () => {
    expect(chunkStarts(180 * 44_100, 352_800, 176_400)).toHaveLength(44)
    expect(chunkStarts(180 * 44_100, 485_100, 242_550)).toHaveLength(32)
  })
})

describe('the overlap-add', () => {
  it('uses a symmetric Hamming fade window', () => {
    const window = fadeWindow(5)
    expect(window[0]).toBeCloseTo(0.08, 6)
    expect(window[2]).toBeCloseTo(1, 6)
    expect(window[4]).toBeCloseTo(0.08, 6)
  })

  it('divides the sum by the sum of the fade window at each sample', () => {
    const window = Float32Array.from([1, 2, 3, 4])
    const sum = createOverlapAdd(6, window)
    const ones = [0, 1].map(() => [0, 1].map(() => new Float32Array(4).fill(1)))
    sum.add(ones, 0, 4)
    sum.add(
      [0, 1].map(() => [0, 1].map(() => new Float32Array(4).fill(3))),
      2,
      4,
    )
    // Sample 2: (1 * 3 + 3 * 1) / (3 + 1). Sample 3: (1 * 4 + 3 * 2) / (4 + 2).
    const expected = [1, 1, 1.5, 10 / 6, 3, 3]
    expect(maxDifference(sum.finish()[1]?.[0] ?? [], expected)).toBeLessThan(1e-6)
  })

  for (const kind of ['bs', 'mel']) {
    it(`gives the separate() result of reference.py for the ${kind} test vector`, () => {
      const result = separateWithGains(channelsOf(fixture(`${kind}-input.f32`), manifest.length))
      expect(maxDifference(flat(result), fixture(`${kind}-separate.f32`))).toBeLessThan(1e-4)
    })

    it(`pads and cuts back a ${kind} input shorter than one chunk, as reference.py does`, () => {
      const result = separateWithGains(channelsOf(fixture(`${kind}-input.f32`), manifest.short))
      expect(result[0]?.[0]).toHaveLength(manifest.short)
      expect(maxDifference(flat(result), fixture(`${kind}-short.f32`))).toBeLessThan(1e-4)
    })
  }
})
