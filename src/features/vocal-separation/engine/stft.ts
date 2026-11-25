import { createFft } from './fft.ts'

/** A short-time Fourier transform of one segment. Each frame holds `bins` values. */
export interface Spectrum {
  real: Float32Array
  imag: Float32Array
  frames: number
  bins: number
}

/** The forward and inverse transforms of one segment size. */
export interface Stft {
  /** The samples of one segment: `(frames - 1) * hop + fftSize`. */
  segmentLength: number
  /** Returns the spectrum of a segment of `segmentLength` samples. The frames have no centre padding. */
  forward(segment: Float32Array): Spectrum
  /**
   * Returns the samples of a spectrum after each bin is multiplied by its mask value.
   * The mask holds `maskBins` values for each frame. The bins at `maskBins` and above get 0.
   * The overlap-add divides by the sum of the squared window, so a mask of 1 gives back the segment.
   */
  inverse(spectrum: Spectrum, mask: Float32Array, maskBins: number): Float32Array
}

/** The settings of a short-time Fourier transform. */
export interface StftSettings {
  fftSize: number
  hop: number
  frames: number
}

/** Returns a periodic Hann window, the window of `tf.signal.stft` that Spleeter used in training. */
export function hannWindow(size: number): Float64Array {
  return Float64Array.from(
    { length: size },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size),
  )
}

/** The sum of the squared window at each sample of the segment. */
function windowSums(window: Float64Array, settings: StftSettings, length: number): Float64Array {
  const sums = new Float64Array(length)
  for (let frame = 0; frame < settings.frames; frame++) {
    const offset = frame * settings.hop
    for (let index = 0; index < settings.fftSize; index++)
      sums[offset + index] = (sums[offset + index] ?? 0) + (window[index] ?? 0) ** 2
  }
  return sums
}

/**
 * Returns the forward and inverse transforms for one segment size, with a periodic Hann window.
 * @param settings The FFT size (a power of 2), the hop in samples and the frames in a segment.
 * Throws a `RangeError` when the FFT size is not a power of 2.
 */
export function createStft(settings: StftSettings): Stft {
  const { fftSize, hop, frames } = settings
  const fft = createFft(fftSize)
  const window = hannWindow(fftSize)
  const bins = fftSize / 2 + 1
  const segmentLength = (frames - 1) * hop + fftSize
  const sums = windowSums(window, settings, segmentLength)
  const real = new Float64Array(fftSize)
  const imag = new Float64Array(fftSize)

  function forward(segment: Float32Array): Spectrum {
    const spectrum = {
      real: new Float32Array(frames * bins),
      imag: new Float32Array(frames * bins),
      frames,
      bins,
    }
    for (let frame = 0; frame < frames; frame++) {
      const offset = frame * hop
      for (let index = 0; index < fftSize; index++)
        real[index] = (segment[offset + index] ?? 0) * (window[index] ?? 0)
      imag.fill(0)
      fft(real, imag, false)
      spectrum.real.set(real.subarray(0, bins), frame * bins)
      spectrum.imag.set(imag.subarray(0, bins), frame * bins)
    }
    return spectrum
  }

  /** Writes the masked bins of one frame and their complex conjugates, so the inverse FFT is real. */
  function maskFrame(
    spectrum: Spectrum,
    mask: Float32Array,
    maskBins: number,
    frame: number,
  ): void {
    real.fill(0)
    imag.fill(0)
    const limit = Math.min(maskBins, bins)
    for (let bin = 0; bin < limit; bin++) {
      const gain = mask[frame * maskBins + bin] ?? 0
      const binReal = (spectrum.real[frame * bins + bin] ?? 0) * gain
      const binImag = (spectrum.imag[frame * bins + bin] ?? 0) * gain
      real[bin] = binReal
      imag[bin] = binImag
      if (bin === 0 || bin === fftSize / 2) continue
      real[fftSize - bin] = binReal
      imag[fftSize - bin] = -binImag
    }
  }

  function inverse(spectrum: Spectrum, mask: Float32Array, maskBins: number): Float32Array {
    const output = new Float64Array(segmentLength)
    for (let frame = 0; frame < frames; frame++) {
      maskFrame(spectrum, mask, maskBins, frame)
      fft(real, imag, true)
      const offset = frame * hop
      for (let index = 0; index < fftSize; index++) {
        output[offset + index] =
          (output[offset + index] ?? 0) + ((real[index] ?? 0) / fftSize) * (window[index] ?? 0)
      }
    }
    // The first and the last samples have a window sum near 0, and a division there amplifies noise.
    return Float32Array.from(output, (value, index) => {
      const sum = sums[index] ?? 0
      return sum > 1e-3 ? value / sum : 0
    })
  }

  return { segmentLength, forward, inverse }
}
