import type { TimeRange } from '../time/timeRange.ts'

/** The lowest and the highest sample of each bucket of one zoom level. */
export type PeakLevel = {
  /** The samples in each bucket. */
  bucket: number
  min: Int16Array<ArrayBuffer>
  max: Int16Array<ArrayBuffer>
}

/**
 * The samples in each bucket of the finest level.
 * At 22 050 Hz, 16 samples are 0.73 ms, and the highest zoom of 1 000 px for each second gives 22 samples for each pixel.
 */
export const BASE_BUCKET = 16

/** The largest value of a 16-bit sample. A peak divided by it is from -1 to 1. */
const PCM_MAX = 0x7fff

/**
 * Returns the finest peak level of one channel of 16-bit samples.
 * The last bucket holds the samples that remain, so it can hold fewer than `bucket` samples.
 * @param samples The 16-bit samples.
 * @param bucket The samples in each bucket.
 */
export function basePeaks(samples: Int16Array, bucket: number = BASE_BUCKET): PeakLevel {
  const count = Math.ceil(samples.length / bucket)
  const min = new Int16Array(count)
  const max = new Int16Array(count)
  for (let index = 0; index < count; index += 1) {
    let low = PCM_MAX
    let high = -PCM_MAX
    const end = Math.min(samples.length, (index + 1) * bucket)
    for (let sample = index * bucket; sample < end; sample += 1) {
      const value = samples[sample] ?? 0
      if (value < low) low = value
      if (value > high) high = value
    }
    min[index] = low
    max[index] = high
  }
  return { bucket, min, max }
}

/** Returns the level with buckets twice as long: each bucket joins two buckets of `level`. */
export function coarserLevel(level: PeakLevel): PeakLevel {
  const count = Math.ceil(level.min.length / 2)
  const min = new Int16Array(count)
  const max = new Int16Array(count)
  for (let index = 0; index < count; index += 1) {
    const first = index * 2
    // An odd count gives a last bucket with one source bucket, so the second index repeats the first.
    const second = Math.min(first + 1, level.min.length - 1)
    min[index] = Math.min(level.min[first] ?? 0, level.min[second] ?? 0)
    max[index] = Math.max(level.max[first] ?? 0, level.max[second] ?? 0)
  }
  return { bucket: level.bucket * 2, min, max }
}

/**
 * Returns the peak levels of the samples, from the finest level to a level with one bucket.
 * The levels together use less memory than the samples, and each zoom reads one level.
 */
export function peakLevels(samples: Int16Array): PeakLevel[] {
  const levels = [basePeaks(samples)]
  for (let level = levels[0]; level !== undefined && level.min.length > 1;) {
    level = coarserLevel(level)
    levels.push(level)
  }
  return levels
}

/**
 * Returns the coarsest level with one bucket or more for each pixel.
 * @param levels The levels from `peakLevels`, from the finest level.
 * @param samplesPerPx The samples that one pixel covers at the zoom.
 */
export function pickLevel(
  levels: readonly PeakLevel[],
  samplesPerPx: number,
): PeakLevel | undefined {
  return levels.findLast((level) => level.bucket <= samplesPerPx) ?? levels[0]
}

/** One audio track with its peak levels, at song times. */
export type TrackPeaks = {
  levels: readonly PeakLevel[]
  sampleRate: number
  /** The song time of the first sample, in milliseconds. */
  startMs: number
  /** The count of samples of the track. */
  sampleCount: number
}

/** The part of the time scale of the stage that the columns need. */
export type ColumnScale = { pxPerMs: number; scrollMs: number }

function inRanges(ranges: readonly TimeRange[], startMs: number, endMs: number): boolean {
  return ranges.some((range) => range.startMs < endMs && range.endMs > startMs)
}

/**
 * Returns the lowest and the highest value of each pixel column of a row, from -1 to 1.
 * The result holds two values for each column: the low value, then the high value.
 * A column with no audio gets `NaN` twice: before the track start, after the track end, and outside `gate`.
 * @param track The track and its peak levels.
 * @param scale The pixels for each millisecond and the time at the left edge of the stage.
 * @param widthPx The width of the row in pixels.
 * @param gate The time ranges that show audio, or null to show all of the track.
 */
export function waveColumns(
  track: TrackPeaks,
  scale: ColumnScale,
  widthPx: number,
  gate: readonly TimeRange[] | null,
): Float32Array<ArrayBuffer> {
  const columns = new Float32Array(Math.max(0, Math.floor(widthPx)) * 2).fill(Number.NaN)
  const samplesPerMs = track.sampleRate / 1000
  const level = pickLevel(track.levels, samplesPerMs / scale.pxPerMs)
  if (level === undefined) return columns
  for (let x = 0; x * 2 < columns.length; x += 1) {
    const startMs = x / scale.pxPerMs + scale.scrollMs
    const endMs = (x + 1) / scale.pxPerMs + scale.scrollMs
    if (gate !== null && !inRanges(gate, startMs, endMs)) continue
    const firstSample = Math.max(0, (startMs - track.startMs) * samplesPerMs)
    const endSample = Math.min(track.sampleCount, (endMs - track.startMs) * samplesPerMs)
    // A column that ends before the first sample or starts after the last sample has no audio.
    if (firstSample >= endSample) continue
    const first = Math.floor(firstSample / level.bucket)
    const last = Math.min(level.min.length, Math.ceil(endSample / level.bucket))
    columns.set(bucketRange(level, first, last), x * 2)
  }
  return columns
}

/** Returns the low value and the high value of the buckets from `first` to `last` (not included), from -1 to 1. */
function bucketRange(level: PeakLevel, first: number, last: number): [number, number] {
  let low = PCM_MAX
  let high = -PCM_MAX
  for (let index = first; index < last; index += 1) {
    low = Math.min(low, level.min[index] ?? 0)
    high = Math.max(high, level.max[index] ?? 0)
  }
  return [low / PCM_MAX, high / PCM_MAX]
}
