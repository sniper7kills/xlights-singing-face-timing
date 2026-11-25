/**
 * Returns the first sample of each window that the segmentation model reads, in order.
 * Each next window starts `stepSamples` after the previous one. The last window ends at the end of the audio,
 * so only audio that is shorter than one window needs padding.
 * @param totalSamples The samples of the audio.
 * @param windowSamples The samples that the model reads in one pass.
 * @param stepSamples The samples between the starts of two adjacent windows. It is more than 0 and not more than `windowSamples`.
 * Throws a `RangeError` when the step is 0 or more than the window.
 */
export function planWindows(
  totalSamples: number,
  windowSamples: number,
  stepSamples: number,
): number[] {
  if (stepSamples <= 0 || stepSamples > windowSamples) {
    throw new RangeError(`The step ${stepSamples} is not in the range 1 to ${windowSamples}.`)
  }
  const lastStart = Math.max(0, totalSamples - windowSamples)
  const starts: number[] = []
  for (let start = 0; start < lastStart; start += stepSamples) starts.push(start)
  starts.push(lastStart)
  return starts
}

/**
 * Returns the samples of one window, padded with zeros to the full window length.
 * @param audio The audio.
 * @param start The first sample of the window.
 * @param windowSamples The samples that the model reads in one pass.
 */
export function windowSamplesAt(
  audio: Float32Array,
  start: number,
  windowSamples: number,
): Float32Array {
  const samples = new Float32Array(windowSamples)
  samples.set(audio.subarray(start, start + windowSamples))
  return samples
}
