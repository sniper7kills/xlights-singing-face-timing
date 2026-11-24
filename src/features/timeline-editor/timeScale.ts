// The waveform and the layers share this scale, so a mark sits under its waveform peak.
// The module holds no DOM and no React code, so the E2E tests can import it.

/** The mapping between a time in the song and a horizontal position in the editor. */
export type TimeScale = {
  /** The pixels for each millisecond. */
  pxPerMs: number
  /** The time at the left edge of the editor, in milliseconds. */
  scrollMs: number
}

export type TimeScaleInput = {
  /** The width of the waveform container and of each layer, in pixels. */
  widthPx: number
  /** The duration of the song in milliseconds. */
  durationMs: number
  /** The zoom from the view store. Null fits the full song in the width. */
  pxPerSecond: number | null
  /** The scroll offset from the view store, in milliseconds. */
  scrollMs: number
}

/**
 * Returns the time scale of the editor.
 * With a null zoom, the full song fills the width, the same as wavesurfer.js with
 * `fillParent: true` and `minPxPerSec: 0`. A full song has no scroll, so the scale
 * ignores the scroll offset in that case.
 */
export function makeTimeScale({
  widthPx,
  durationMs,
  pxPerSecond,
  scrollMs,
}: TimeScaleInput): TimeScale {
  if (pxPerSecond === null) return { pxPerMs: widthPx / durationMs, scrollMs: 0 }
  return { pxPerMs: pxPerSecond / 1000, scrollMs }
}

/** Returns the horizontal position of a time, in pixels from the left edge of the editor. */
export function msToPx(scale: TimeScale, ms: number): number {
  return (ms - scale.scrollMs) * scale.pxPerMs
}

/** Returns the time at a horizontal position, in pixels from the left edge of the editor. */
export function pxToMs(scale: TimeScale, px: number): number {
  return px / scale.pxPerMs + scale.scrollMs
}

/** Returns the left position and the width of a time range, in pixels. */
export function rangeToPx(scale: TimeScale, range: TimeRange): { leftPx: number; widthPx: number } {
  return {
    leftPx: msToPx(scale, range.startMs),
    widthPx: (range.endMs - range.startMs) * scale.pxPerMs,
  }
}

/** A time range in milliseconds. The start is inclusive and the end is exclusive. */
export type TimeRange = { startMs: number; endMs: number }

/** Returns the time range that an editor of `widthPx` pixels shows. */
export function visibleRange(scale: TimeScale, widthPx: number): TimeRange {
  return { startMs: scale.scrollMs, endMs: pxToMs(scale, widthPx) }
}

/**
 * Returns the items that overlap `range`, in their input order.
 * The editor draws only these marks, so a song with 3 000 marks stays fast.
 */
export function inRange<T extends TimeRange>(items: readonly T[], range: TimeRange): T[] {
  return items.filter((item) => item.endMs > range.startMs && item.startMs < range.endMs)
}

/** The time steps of the ruler, from the shortest to the longest. */
const TICK_STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000]

/** A label `m:ss.mmm` is about 60 pixels wide, so two ticks need more space than that. */
const MIN_TICK_GAP_PX = 80

/**
 * Returns the times of the ruler ticks in the visible range of `scale`.
 * The step is the shortest step that keeps the ticks `MIN_TICK_GAP_PX` apart.
 * Each tick time is a multiple of the step.
 */
export function rulerTicks(scale: TimeScale, widthPx: number): number[] {
  // A song is 15 minutes or shorter, so the longest step keeps the tick count small.
  const step = TICK_STEPS_MS.find((ms) => ms * scale.pxPerMs >= MIN_TICK_GAP_PX) ?? 60_000
  const { startMs, endMs } = visibleRange(scale, widthPx)
  const ticks: number[] = []
  for (let ms = Math.ceil(startMs / step) * step; ms < endMs; ms += step) ticks.push(ms)
  return ticks
}
