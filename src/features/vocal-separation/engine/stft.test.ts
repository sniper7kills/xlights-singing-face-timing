import { describe, expect, it } from 'vitest'
import { createStft, hannWindow } from './stft.ts'

const settings = { fftSize: 16, hop: 4, frames: 9 }

function testSignal(length: number): Float32Array {
  return Float32Array.from(
    { length },
    (_, index) => Math.sin(index * 0.7) + 0.3 * Math.cos(index * 2.1),
  )
}

describe('hannWindow', () => {
  it('is periodic: 0 at the first value and 1 at the middle', () => {
    const window = hannWindow(8)
    expect(window[0]).toBe(0)
    expect(window[4]).toBeCloseTo(1, 12)
    expect(window[7]).toBeCloseTo(window[1] ?? NaN, 12)
  })
})

describe('createStft', () => {
  it('has a segment length of (frames - 1) * hop + fftSize', () => {
    expect(createStft(settings).segmentLength).toBe(48)
  })

  it('gives fftSize / 2 + 1 bins for each frame', () => {
    const stft = createStft(settings)
    const spectrum = stft.forward(testSignal(stft.segmentLength))
    expect(spectrum.bins).toBe(9)
    expect(spectrum.real).toHaveLength(9 * 9)
  })

  it('gives back the segment inside the edges with a mask of 1 for all bins', () => {
    const stft = createStft(settings)
    const segment = testSignal(stft.segmentLength)
    const spectrum = stft.forward(segment)
    const output = stft.inverse(spectrum, new Float32Array(9 * 9).fill(1), 9)
    for (let index = 4; index < stft.segmentLength - 4; index++) {
      expect(output[index]).toBeCloseTo(segment[index] ?? NaN, 5)
    }
  })

  it('gives silence for a mask of 0', () => {
    const stft = createStft(settings)
    const spectrum = stft.forward(testSignal(stft.segmentLength))
    const output = stft.inverse(spectrum, new Float32Array(9 * 9), 9)
    expect(output.every((value) => value === 0)).toBe(true)
  })

  it('removes the bins at the mask size and above', () => {
    const stft = createStft(settings)
    const index = Array.from({ length: stft.segmentLength }, (_, sample) => sample)
    // Bin 1 is 1 cycle in 16 samples, and bin 6 is 6 cycles in 16 samples.
    const low = index.map((sample) => Math.sin((2 * Math.PI * sample) / 16))
    const high = index.map((sample) => Math.sin((2 * Math.PI * 6 * sample) / 16))
    const spectrum = stft.forward(
      Float32Array.from(index, (sample) => (low[sample] ?? 0) + (high[sample] ?? 0)),
    )
    const output = stft.inverse(spectrum, new Float32Array(9 * 4).fill(1), 4)
    for (let sample = 16; sample < stft.segmentLength - 16; sample++) {
      expect(output[sample]).toBeCloseTo(low[sample] ?? NaN, 4)
    }
  })
})
