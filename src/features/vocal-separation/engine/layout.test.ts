import { describe, expect, it } from 'vitest'
import { magnitudeInput, vocalsMask } from './layout.ts'
import type { Spectrum } from './stft.ts'

function spectrum(real: number[], imag: number[], frames: number, bins: number): Spectrum {
  return { real: Float32Array.from(real), imag: Float32Array.from(imag), frames, bins }
}

describe('magnitudeInput', () => {
  it('writes the magnitude of the first model bins in the order channel, frame, bin', () => {
    const left = spectrum([3, 1, 9, 0, 2, 9], [4, 0, 9, 1, 0, 9], 2, 3)
    const right = spectrum([0, 5, 9, 6, 0, 9], [1, 12, 9, 8, 0, 9], 2, 3)
    expect(Array.from(magnitudeInput([left, right], 2))).toEqual([5, 1, 1, 2, 1, 13, 10, 0])
  })
})

describe('vocalsMask', () => {
  it('gives v² / (v² + a²) for each bin of the channel', () => {
    const vocals = Float32Array.from([3, 0, 1, 2])
    const accompaniment = Float32Array.from([4, 2, 0, 2])
    const right = vocalsMask(vocals, accompaniment, 1, 2)
    expect(right[0]).toBeCloseTo(1, 6)
    expect(right[1]).toBeCloseTo(0.5, 6)
    const left = vocalsMask(vocals, accompaniment, 0, 2)
    expect(left[0]).toBeCloseTo(9 / 25, 6)
    expect(left[1]).toBeCloseTo(0, 6)
  })

  it('gives 0.5 where both estimates are 0', () => {
    expect(vocalsMask(new Float32Array(1), new Float32Array(1), 0, 1)[0]).toBeCloseTo(0.5, 6)
  })
})
