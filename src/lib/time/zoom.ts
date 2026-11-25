import type { TimeRange } from './timeRange.ts'

/** One key press on the zoom slider multiplies or divides the zoom by this ratio. */
export const ZOOM_KEY_RATIO = 1.1

/** "Zoom to selection" leaves this part of the stage width free on each side of the selection. */
export const ZOOM_MARGIN = 0.1

function middle(range: TimeRange): number {
  return (range.startMs + range.endMs) / 2
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The state of the view that decides the point that a zoom keeps in place. */
export type ZoomAnchorInput = {
  /** The time range that the stage shows before the zoom. */
  visible: TimeRange
  /** The selected marks from the earliest start to the latest end, or undefined when no mark is selected. */
  selected: TimeRange | undefined
  /** The time of the play cursor. */
  playMs: number
}

/**
 * Returns the time that a zoom of the slider or of the `+` and `-` keys keeps in place.
 * - The middle of the selected marks, when a part of them is in view. A middle out of view moves to the nearest edge of the view.
 * - Else the play cursor, when it is in view.
 * - Else the middle of the view.
 */
export function zoomAnchorMs({ visible, selected, playMs }: ZoomAnchorInput): number {
  if (selected && selected.endMs > visible.startMs && selected.startMs < visible.endMs)
    return clamp(middle(selected), visible.startMs, visible.endMs)
  if (playMs >= visible.startMs && playMs <= visible.endMs) return playMs
  return middle(visible)
}

/**
 * Returns the scroll offset that shows all of the range, with the least scroll.
 * A range that is longer than the view keeps the scroll offset, so the zoom anchor stays in place.
 * @param scrollMs The scroll offset now, in milliseconds.
 * @param viewMs The time that the stage shows, in milliseconds.
 * @param range The range to show, for example the selected marks.
 */
export function revealScrollMs(scrollMs: number, viewMs: number, range: TimeRange): number {
  if (range.endMs - range.startMs > viewMs) return scrollMs
  if (range.startMs < scrollMs) return range.startMs
  return Math.max(scrollMs, range.endMs - viewMs)
}

/**
 * Returns the scroll offset that keeps `anchorMs` at the same position in the stage after a zoom.
 * The caller keeps the result inside the song.
 * @param scrollMs The scroll offset before the zoom, in milliseconds.
 * @param oldPxPerMs The zoom before, in pixels for each millisecond.
 * @param newPxPerMs The zoom after, in pixels for each millisecond.
 * @param anchorMs The time that stays in place.
 */
export function anchoredScrollMs(
  scrollMs: number,
  oldPxPerMs: number,
  newPxPerMs: number,
  anchorMs: number,
): number {
  return anchorMs - ((anchorMs - scrollMs) * oldPxPerMs) / newPxPerMs
}

/**
 * Returns the zoom in pixels for each second that shows the range with `ZOOM_MARGIN` free on each side.
 * The caller keeps the zoom inside the limits of the slider.
 * @param range The range to show. A range of 0 ms counts as 1 ms.
 * @param widthPx The width of the stage in pixels.
 */
export function fitZoom(range: TimeRange, widthPx: number): number {
  const spanMs = Math.max(1, range.endMs - range.startMs)
  return (widthPx * 1000) / (spanMs * (1 + 2 * ZOOM_MARGIN))
}

/**
 * Returns the scroll offset that puts the middle of the range at the middle of the stage.
 * The caller keeps the result inside the song.
 * @param range The range to show.
 * @param widthPx The width of the stage in pixels.
 * @param pxPerSecond The zoom in pixels for each second.
 */
export function centredScrollMs(range: TimeRange, widthPx: number, pxPerSecond: number): number {
  return middle(range) - (widthPx / 2) * (1000 / pxPerSecond)
}

/**
 * Returns the zoom after `steps` key presses on the zoom slider. Each press changes the zoom by `ZOOM_KEY_RATIO`.
 * The caller keeps the zoom inside the limits of the slider.
 * @param pxPerSecond The zoom before, in pixels for each second.
 * @param steps A positive count zooms in, and a negative count zooms out.
 */
export function ratioZoom(pxPerSecond: number, steps: number): number {
  return pxPerSecond * ZOOM_KEY_RATIO ** steps
}
