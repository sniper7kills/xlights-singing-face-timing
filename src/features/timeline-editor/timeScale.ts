// The waveform and the layers share this scale, so a mark sits under its waveform peak.
// The module holds no DOM and no React code, so the E2E tests can import it.
// The zoom maths and the scroll maths of the editor live here, with unit tests.

import type { TimeRange } from '../../lib/time/timeRange.ts'

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

/** The lowest zoom of the slider, in pixels for each second. */
export const MIN_ZOOM = 10
/** The highest zoom of the slider, in pixels for each second. */
export const MAX_ZOOM = 1000

/** The zoom changes by this factor for each `+` or `-` key. */
const KEY_ZOOM_FACTOR = 1.5

/** A wheel step of this many pixels doubles or halves the zoom. */
const WHEEL_PX_PER_DOUBLE = 300

/**
 * Returns the time scale of the editor.
 * With a null zoom, the full song fills the width, the same as wavesurfer.js with
 * `fillParent: true` and `minPxPerSec: 0`. A full song has no scroll, so the scale
 * ignores the scroll offset in that case.
 * The scale keeps the scroll offset from 0 to the time that puts the song end at the right edge.
 */
export function makeTimeScale({
  widthPx,
  durationMs,
  pxPerSecond,
  scrollMs,
}: TimeScaleInput): TimeScale {
  if (pxPerSecond === null) return { pxPerMs: widthPx / durationMs, scrollMs: 0 }
  const pxPerMs = pxPerSecond / 1000
  const maxScrollMs = Math.max(0, durationMs - widthPx / pxPerMs)
  return { pxPerMs, scrollMs: clamp(scrollMs, 0, maxScrollMs) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Returns the zoom in pixels for each second, kept from `MIN_ZOOM` to `MAX_ZOOM`. */
export function clampZoom(pxPerSecond: number): number {
  return clamp(pxPerSecond, MIN_ZOOM, MAX_ZOOM)
}

/**
 * Returns the zoom that the slider shows, in whole pixels for each second.
 * A null zoom shows the zoom that fits the full song, kept from `MIN_ZOOM` to `MAX_ZOOM`.
 */
export function shownZoom(input: TimeScaleInput): number {
  return Math.round(clampZoom(makeTimeScale(input).pxPerMs * 1000))
}

/** The zoom and the scroll offset of the view store. */
export type ZoomView = { pxPerSecond: number; scrollMs: number }

/**
 * Returns the view at the zoom `pxPerSecond`, with the time at `anchorPx` kept at `anchorPx`.
 * The zoom stays from `MIN_ZOOM` to `MAX_ZOOM`. At an edge of the song, the scroll
 * offset stops at its limit, and the time at `anchorPx` can move.
 * @param input The view before the zoom.
 * @param pxPerSecond The new zoom, in pixels for each second.
 * @param anchorPx The position that keeps its time, in pixels from the left edge of the editor.
 */
export function zoomAt(input: TimeScaleInput, pxPerSecond: number, anchorPx: number): ZoomView {
  const anchorMs = pxToMs(makeTimeScale(input), anchorPx)
  const next = clampZoom(pxPerSecond)
  const scrollMs = anchorMs - anchorPx / (next / 1000)
  return {
    pxPerSecond: next,
    scrollMs: makeTimeScale({ ...input, pxPerSecond: next, scrollMs }).scrollMs,
  }
}

/**
 * Returns the view after one `+` or `-` key, with the time at the centre of the editor kept there.
 * @param direction 1 zooms in, -1 zooms out.
 */
export function zoomStep(input: TimeScaleInput, direction: 1 | -1): ZoomView {
  const current = makeTimeScale(input).pxPerMs * 1000
  return zoomAt(input, current * KEY_ZOOM_FACTOR ** direction, input.widthPx / 2)
}

/**
 * Returns the view after a wheel step with `Ctrl`, with the time under the pointer kept there.
 * @param deltaPx The vertical wheel distance. A negative distance zooms in.
 * @param pointerPx The pointer position, in pixels from the left edge of the editor.
 */
export function wheelZoom(input: TimeScaleInput, deltaPx: number, pointerPx: number): ZoomView {
  const current = makeTimeScale(input).pxPerMs * 1000
  return zoomAt(input, current * 2 ** (-deltaPx / WHEEL_PX_PER_DOUBLE), pointerPx)
}

/**
 * Returns the scroll offset after a scroll of `deltaPx` pixels. A positive distance moves later in the song.
 * At the default zoom, the full song is in view, so the offset stays 0.
 */
export function scrollByPx(input: TimeScaleInput, deltaPx: number): number {
  const scale = makeTimeScale(input)
  return makeTimeScale({ ...input, scrollMs: scale.scrollMs + deltaPx / scale.pxPerMs }).scrollMs
}

/**
 * Returns the scroll offset that brings the play cursor back into view, or null when it is in view.
 * A play cursor at or after the right edge, or before the left edge, goes to the left edge.
 * At the end of the song, the offset stops at its limit. At the default zoom, the full song is in view.
 */
export function followCursor(input: TimeScaleInput, playMs: number): number | null {
  if (input.pxPerSecond === null) return null
  const x = msToPx(makeTimeScale(input), playMs)
  if (x >= 0 && x < input.widthPx) return null
  return makeTimeScale({ ...input, scrollMs: playMs }).scrollMs
}

/** Returns the time at `px`, in whole milliseconds, kept from 0 to `durationMs`. */
export function timeAtPx(scale: TimeScale, px: number, durationMs: number): number {
  return Math.round(clamp(pxToMs(scale, px), 0, durationMs))
}

/**
 * Returns the time range between two positions, in whole milliseconds, in time order.
 * The range stays from 0 to `durationMs`.
 */
export function rangeBetweenPx(
  scale: TimeScale,
  fromPx: number,
  toPx: number,
  durationMs: number,
): TimeRange {
  const a = timeAtPx(scale, fromPx, durationMs)
  const b = timeAtPx(scale, toPx, durationMs)
  return { startMs: Math.min(a, b), endMs: Math.max(a, b) }
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
