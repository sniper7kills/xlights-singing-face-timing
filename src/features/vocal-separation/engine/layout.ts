import type { Spectrum } from './stft.ts'

/**
 * Returns the model input: the magnitude of the first `modelBins` bins of each frame, for each channel.
 * The layout is `[channel, frame, bin]`, the tensor shape `[2, 1, frames, modelBins]` of the Spleeter export.
 * @param channels The spectrum of the left channel, then of the right channel. Both have the same frames.
 * @param modelBins The bins that the model reads. It is not more than the bins of a spectrum.
 */
export function magnitudeInput(channels: readonly Spectrum[], modelBins: number): Float32Array {
  const frames = channels[0]?.frames ?? 0
  const input = new Float32Array(channels.length * frames * modelBins)
  channels.forEach((spectrum, channel) => {
    for (let frame = 0; frame < frames; frame++) {
      for (let bin = 0; bin < modelBins; bin++) {
        const source = frame * spectrum.bins + bin
        const real = spectrum.real[source] ?? 0
        const imag = spectrum.imag[source] ?? 0
        input[(channel * frames + frame) * modelBins + bin] = Math.sqrt(real * real + imag * imag)
      }
    }
  })
  return input
}

/** Keeps the mask defined where both estimates are 0. Spleeter uses the same value. */
const EPSILON = 1e-10

/**
 * Returns the soft mask of the vocals for one channel: v² / (v² + a²) for each bin.
 * Spleeter computes the same mask from the two magnitude estimates.
 * @param vocals The output of the vocals model, in the layout of `magnitudeInput`.
 * @param accompaniment The output of the accompaniment model, in the same layout.
 * @param channel The channel of the mask.
 * @param size The values of one channel: frames times model bins.
 */
export function vocalsMask(
  vocals: Float32Array,
  accompaniment: Float32Array,
  channel: number,
  size: number,
): Float32Array {
  const mask = new Float32Array(size)
  const offset = channel * size
  for (let index = 0; index < size; index++) {
    const voice = (vocals[offset + index] ?? 0) ** 2
    const rest = (accompaniment[offset + index] ?? 0) ** 2
    mask[index] = (voice + EPSILON / 2) / (voice + rest + EPSILON)
  }
  return mask
}
