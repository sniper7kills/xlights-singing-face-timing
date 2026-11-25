import { describe, expect, it } from 'vitest'
import { createFft } from './fft.ts'

/** Returns the DFT of a real signal by the definition, for comparison. */
function slowDft(signal: number[]): { real: number[]; imag: number[] } {
  const size = signal.length
  const real: number[] = []
  const imag: number[] = []
  for (let bin = 0; bin < size; bin++) {
    let sumReal = 0
    let sumImag = 0
    signal.forEach((value, index) => {
      sumReal += value * Math.cos((2 * Math.PI * bin * index) / size)
      sumImag -= value * Math.sin((2 * Math.PI * bin * index) / size)
    })
    real.push(sumReal)
    imag.push(sumImag)
  }
  return { real, imag }
}

describe('createFft', () => {
  it('gives the same bins as the DFT definition', () => {
    const signal = [0.5, -1, 2, 0.25, 0, 3, -0.5, 1]
    const real = Float64Array.from(signal)
    const imag = new Float64Array(signal.length)
    createFft(signal.length)(real, imag, false)
    const expected = slowDft(signal)
    expected.real.forEach((value, bin) => expect(real[bin]).toBeCloseTo(value, 10))
    expected.imag.forEach((value, bin) => expect(imag[bin]).toBeCloseTo(value, 10))
  })

  it('gives back the signal times the size after the inverse transform', () => {
    const signal = [1, 2, 3, 4, -4, -3, -2, -1, 0.5, 0, 0, 7, 1, 1, 1, 1]
    const fft = createFft(signal.length)
    const real = Float64Array.from(signal)
    const imag = new Float64Array(signal.length)
    fft(real, imag, false)
    fft(real, imag, true)
    signal.forEach((value, index) => {
      expect((real[index] ?? NaN) / signal.length).toBeCloseTo(value, 10)
      expect(imag[index]).toBeCloseTo(0, 10)
    })
  })

  it('throws a RangeError for a size that is not a power of 2', () => {
    expect(() => createFft(12)).toThrow(RangeError)
  })
})
