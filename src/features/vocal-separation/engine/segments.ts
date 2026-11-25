/** One part of the audio that the model reads in one pass. */
export interface Segment {
  /** The first sample of the segment in the audio. */
  start: number
  /** The samples of the audio in the segment. The last segment can be shorter than the segment length. */
  length: number
}

/**
 * Returns the segments that cover the audio, in order. Each next segment starts `overlap` samples before the end of the previous one.
 * @param totalSamples The samples of the audio.
 * @param segmentLength The samples that the model reads in one pass.
 * @param overlap The samples that two adjacent segments share. It is less than `segmentLength`.
 * Throws a `RangeError` when the overlap is not less than the segment length.
 */
export function planSegments(
  totalSamples: number,
  segmentLength: number,
  overlap: number,
): Segment[] {
  if (overlap >= segmentLength) {
    throw new RangeError(
      `The overlap ${overlap} is not less than the segment length ${segmentLength}.`,
    )
  }
  const stride = segmentLength - overlap
  const segments: Segment[] = []
  for (let start = 0; start < totalSamples; start += stride) {
    const length = Math.min(segmentLength, totalSamples - start)
    segments.push({ start, length })
    if (start + length >= totalSamples) break
  }
  return segments
}

/**
 * Adds the output of one segment to the audio output, with a linear cross-fade in each overlap.
 * The fade-out of a segment and the fade-in of the next segment add up to 1 at each sample.
 * So the output needs no division by a weight sum, and a constant input gives the same constant.
 * @param output The audio output. The function adds to it.
 * @param values The output of the segment. It holds at least `segment.length` values.
 * @param segment The segment from `planSegments`.
 * @param overlap The overlap from `planSegments`.
 * @param totalSamples The samples of the audio.
 */
export function addSegment(
  output: Float32Array,
  values: Float32Array,
  segment: Segment,
  overlap: number,
  totalSamples: number,
): void {
  const fadeIn = segment.start > 0 ? overlap : 0
  const fadeOut = segment.start + segment.length < totalSamples ? overlap : 0
  for (let index = 0; index < segment.length; index++) {
    let weight = 1
    if (index < fadeIn) weight = (index + 0.5) / overlap
    const fromEnd = segment.length - index
    if (fromEnd <= fadeOut) weight = (fromEnd - 0.5) / overlap
    output[segment.start + index] =
      (output[segment.start + index] ?? 0) + (values[index] ?? 0) * weight
  }
}
