import { createFft } from '../../vocal-separation/engine/fft.ts'
import { hannWindow } from '../../vocal-separation/engine/stft.ts'

// The STFT parameters of both singer split graphs, from section 3 of the contract of issue #191.
export const N_FFT = 2048
export const HOP = 441
export const BINS = N_FFT / 2 + 1
const PAD = N_FFT / 2

/**
 * Returns the flat index of a value in the input tensor `[1, 2, 1025, frames, 2]`.
 * @param channel 0 for left, 1 for right.
 * @param bin The frequency bin, 0 to 1024.
 * @param frame The STFT frame.
 * @param part 0 for the real part, 1 for the imaginary part.
 * @param frames The frames of one chunk.
 */
export function inputIndex(
  channel: number,
  bin: number,
  frame: number,
  part: number,
  frames: number,
): number {
  return ((channel * BINS + bin) * frames + frame) * 2 + part
}

/**
 * Returns the flat index of a value in the output tensor `[1, 2, 2, 1025, frames, 2]`.
 * @param stem The output stem, 0 or 1.
 * @param channel 0 for left, 1 for right.
 * @param bin The frequency bin, 0 to 1024.
 * @param frame The STFT frame.
 * @param part 0 for the real part, 1 for the imaginary part.
 * @param frames The frames of one chunk.
 */
export function outputIndex(
  stem: number,
  channel: number,
  bin: number,
  frame: number,
  part: number,
  frames: number,
): number {
  return inputIndex(stem * 2 + channel, bin, frame, part, frames)
}

/** The forward STFT into the input tensor, and the inverse STFT of one stem, for one chunk length. */
export type RoformerStft = {
  /** The samples of one chunk. */
  chunkSamples: number
  /** The frames of one chunk: `chunkSamples / 441 + 1`. */
  frames: number
  /**
   * Writes the spectrum of two channels into the input tensor, in the layout of `inputIndex`.
   * @param channels The left and the right samples of one chunk, each `chunkSamples` long.
   * @param input The tensor data, `2 * 1025 * frames * 2` values.
   */
  forward(channels: readonly [Float32Array, Float32Array], input: Float32Array): void
  /**
   * Returns the samples of one stem and one channel of the output tensor, `chunkSamples` long.
   * @param output The output tensor data, in the layout of `outputIndex`.
   */
  inverse(output: Float32Array, stem: number, channel: number): Float32Array
}

/** Returns the sample of the signal at a padded position, with the reflect padding of the contract. */
function reflected(samples: Float32Array, position: number): number {
  const index = position - PAD
  const length = samples.length
  if (index < 0) return samples[-index] ?? 0
  if (index >= length) return samples[2 * (length - 1) - index] ?? 0
  return samples[index] ?? 0
}

/** Returns the sum of the squared window at each sample of a chunk, after the cut of the padding. */
function envelope(window: Float64Array, frames: number): Float64Array {
  const total = N_FFT + HOP * (frames - 1)
  const sums = new Float64Array(total)
  for (let frame = 0; frame < frames; frame++) {
    for (let index = 0; index < N_FFT; index++) {
      const position = frame * HOP + index
      sums[position] = (sums[position] ?? 0) + (window[index] ?? 0) ** 2
    }
  }
  return sums.subarray(PAD, total - PAD)
}

/**
 * Returns the STFT of the singer split graphs for one chunk length.
 * The forward transform has a periodic Hann window of 2048, a hop of 441, reflect padding of 1024 on each side and no scale.
 * The inverse transform is `torch.istft` with the same parameters: an inverse FFT with the scale 1/2048, the window, the overlap-add and the division by the squared window sum.
 * @param chunkSamples The samples of one chunk, a multiple of 441 and more than 1024.
 * Throws a `RangeError` when the chunk length is not a multiple of 441 or is not more than 1024.
 */
export function createRoformerStft(chunkSamples: number): RoformerStft {
  if (chunkSamples % HOP !== 0 || chunkSamples <= PAD) {
    throw new RangeError(`The chunk length ${chunkSamples} is not a multiple of 441 above 1024.`)
  }
  const frames = chunkSamples / HOP + 1
  const fft = createFft(N_FFT)
  const window = hannWindow(N_FFT)
  const sums = envelope(window, frames)
  const real = new Float64Array(N_FFT)
  const imag = new Float64Array(N_FFT)

  function forward(channels: readonly [Float32Array, Float32Array], input: Float32Array): void {
    channels.forEach((samples, channel) => {
      for (let frame = 0; frame < frames; frame++) {
        for (let index = 0; index < N_FFT; index++)
          real[index] = reflected(samples, frame * HOP + index) * (window[index] ?? 0)
        imag.fill(0)
        fft(real, imag, false)
        for (let bin = 0; bin < BINS; bin++) {
          input[inputIndex(channel, bin, frame, 0, frames)] = real[bin] ?? 0
          input[inputIndex(channel, bin, frame, 1, frames)] = imag[bin] ?? 0
        }
      }
    })
  }

  /** Writes the bins of one frame and their complex conjugates, so the real part of the inverse FFT is `numpy.fft.irfft`. */
  function loadFrame(output: Float32Array, stem: number, channel: number, frame: number): void {
    for (let bin = 0; bin < BINS; bin++) {
      const binReal = output[outputIndex(stem, channel, bin, frame, 0, frames)] ?? 0
      const binImag = output[outputIndex(stem, channel, bin, frame, 1, frames)] ?? 0
      real[bin] = binReal
      imag[bin] = binImag
      if (bin === 0 || bin === N_FFT / 2) continue
      real[N_FFT - bin] = binReal
      imag[N_FFT - bin] = -binImag
    }
  }

  function inverse(output: Float32Array, stem: number, channel: number): Float32Array {
    const sum = new Float64Array(N_FFT + HOP * (frames - 1))
    for (let frame = 0; frame < frames; frame++) {
      loadFrame(output, stem, channel, frame)
      fft(real, imag, true)
      const offset = frame * HOP
      for (let index = 0; index < N_FFT; index++)
        sum[offset + index] =
          (sum[offset + index] ?? 0) + ((real[index] ?? 0) / N_FFT) * (window[index] ?? 0)
    }
    const samples = new Float32Array(chunkSamples)
    for (let index = 0; index < chunkSamples; index++)
      samples[index] = (sum[PAD + index] ?? 0) / (sums[index] ?? 1)
    return samples
  }

  return { chunkSamples, frames, forward, inverse }
}

/**
 * Returns the first sample of each chunk, by the rule of the PyTorch pipeline (audio-separator 0.48.0, RoFormer path).
 * The starts are 0, step, 2 * step and so on. The first start whose chunk reaches the end becomes `max(length - chunk, 0)`, and it is the last one.
 * @param length The samples of the audio.
 * @param chunk The samples of one chunk.
 * @param step The samples between two starts: `floor(chunk / overlap)`.
 */
export function chunkStarts(length: number, chunk: number, step: number): number[] {
  const starts: number[] = []
  for (let offset = 0; offset < length; offset += step) {
    if (offset + chunk >= length) {
      const tail = Math.max(length - chunk, 0)
      if (starts.at(-1) !== tail) starts.push(tail)
      break
    }
    starts.push(offset)
  }
  return starts
}

/**
 * Returns the fade window of the overlap-add: a symmetric Hamming window, `0.54 - 0.46 * cos(2 * pi * i / (length - 1))`.
 * @param length The samples of one chunk.
 */
export function fadeWindow(length: number): Float32Array {
  return Float32Array.from(
    { length },
    (_, index) => 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (length - 1)),
  )
}

/** The overlap-add of the chunks of two stems with two channels each. */
export type OverlapAdd = {
  /**
   * Adds the output of one chunk at `start`, with the fade window. Only the first `length` samples count.
   * @param chunk The samples of each stem and channel: `chunk[stem][channel]`.
   */
  add(chunk: readonly (readonly Float32Array[])[], start: number, length: number): void
  /** Divides the sum by the sum of the fade window at each sample, and returns `result[stem][channel]`. */
  finish(): Float32Array[][]
}

/**
 * Returns the overlap-add of the contract for two stems with two channels.
 * @param length The samples of the audio.
 * @param window The fade window from `fadeWindow`.
 */
export function createOverlapAdd(length: number, window: Float32Array): OverlapAdd {
  const result = [0, 1].map(() => [new Float32Array(length), new Float32Array(length)])
  const counter = new Float32Array(length)
  return {
    add(chunk, start, count) {
      result.forEach((channels, stem) =>
        channels.forEach((target, channel) => {
          const values = chunk[stem]?.[channel]
          for (let index = 0; index < count; index++)
            target[start + index] =
              (target[start + index] ?? 0) + (values?.[index] ?? 0) * (window[index] ?? 0)
        }),
      )
      for (let index = 0; index < count; index++)
        counter[start + index] = (counter[start + index] ?? 0) + (window[index] ?? 0)
    },
    finish() {
      for (const channels of result)
        for (const target of channels)
          for (let index = 0; index < length; index++)
            target[index] = (target[index] ?? 0) / Math.max(counter[index] ?? 0, 1e-10)
      return result
    },
  }
}
