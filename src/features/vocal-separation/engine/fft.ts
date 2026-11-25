/** An in-place complex FFT of one fixed size. */
export type Fft = (real: Float64Array, imag: Float64Array, inverse: boolean) => void

function bitReversal(size: number): Uint32Array {
  const levels = Math.log2(size)
  const table = new Uint32Array(size)
  for (let index = 0; index < size; index++) {
    let reversed = 0
    for (let bit = 0; bit < levels; bit++) reversed |= ((index >> bit) & 1) << (levels - 1 - bit)
    table[index] = reversed
  }
  return table
}

function swapReversed(real: Float64Array, imag: Float64Array, reversed: Uint32Array): void {
  for (let index = 0; index < reversed.length; index++) {
    const other = reversed[index] ?? 0
    if (other <= index) continue
    const swapReal = real[index] ?? 0
    real[index] = real[other] ?? 0
    real[other] = swapReal
    const swapImag = imag[index] ?? 0
    imag[index] = imag[other] ?? 0
    imag[other] = swapImag
  }
}

/** Combines the value at `top` with the value `half` places after it, with one twiddle factor. */
function butterfly(
  real: Float64Array,
  imag: Float64Array,
  top: number,
  half: number,
  twiddleReal: number,
  twiddleImag: number,
): void {
  const bottom = top + half
  const bottomReal = real[bottom] ?? 0
  const bottomImag = imag[bottom] ?? 0
  const topReal = real[top] ?? 0
  const topImag = imag[top] ?? 0
  const productReal = bottomReal * twiddleReal - bottomImag * twiddleImag
  const productImag = bottomReal * twiddleImag + bottomImag * twiddleReal
  real[bottom] = topReal - productReal
  imag[bottom] = topImag - productImag
  real[top] = topReal + productReal
  imag[top] = topImag + productImag
}

/**
 * Returns a radix-2 complex FFT for arrays of `size` values.
 * The forward transform uses the sign -1 in the exponent. The inverse transform does not divide by `size`.
 * @param size A power of 2.
 * Throws a `RangeError` when `size` is not a power of 2.
 */
export function createFft(size: number): Fft {
  if (size < 1 || !Number.isInteger(Math.log2(size))) {
    throw new RangeError(`The FFT size must be a power of 2: ${size}`)
  }
  const reversed = bitReversal(size)
  const cos = new Float64Array(size / 2)
  const sin = new Float64Array(size / 2)
  for (let index = 0; index < size / 2; index++) {
    cos[index] = Math.cos((2 * Math.PI * index) / size)
    sin[index] = Math.sin((2 * Math.PI * index) / size)
  }
  return (real, imag, inverse) => {
    swapReversed(real, imag, reversed)
    const sign = inverse ? 1 : -1
    for (let span = 2; span <= size; span *= 2) {
      const half = span / 2
      const step = size / span
      for (let start = 0; start < size; start += span) {
        for (let offset = 0; offset < half; offset++) {
          const twiddleReal = cos[offset * step] ?? 0
          const twiddleImag = sign * (sin[offset * step] ?? 0)
          butterfly(real, imag, start + offset, half, twiddleReal, twiddleImag)
        }
      }
    }
  }
}
