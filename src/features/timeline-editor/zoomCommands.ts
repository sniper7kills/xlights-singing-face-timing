import { blockText } from '../../lib/marks/editBlocks.ts'
import { selectionRange } from '../../lib/marks/selection.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { ratioZoom, revealScrollMs, zoomAnchorMs } from '../../lib/time/zoom.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import {
  makeTimeScale,
  visibleRange,
  zoomAround,
  zoomStep,
  zoomToRange,
  type ZoomView,
} from './timeScale.ts'
import { reportStatus } from './statusStore.ts'
import { currentStageInput } from './useStageScale.ts'

function applyView({ pxPerSecond, scrollMs }: ZoomView) {
  const view = useViewStore.getState()
  view.setZoom(pxPerSecond)
  view.setScroll(scrollMs)
}

function selectedNow(): TimeRange | undefined {
  const marks = useSongStore.getState().current?.marks ?? []
  return selectionRange(marks, useViewStore.getState().selectedMarkIds)
}

/**
 * Applies a zoom that keeps one time in place. See `zoomAnchorMs`.
 * When the anchor is the selected marks, the view then scrolls the least to show all of them.
 * @param durationMs The duration of the open song.
 * @param zoom Returns the view at the new zoom, with the anchor time kept in place.
 */
function zoomKeepingPlace(durationMs: number, zoom: (anchorMs: number) => ZoomView): void {
  const input = currentStageInput(durationMs)
  const visible = visibleRange(makeTimeScale(input), input.widthPx)
  const selected = selectedNow()
  const next = zoom(zoomAnchorMs({ visible, selected, playMs: useViewStore.getState().playTimeMs }))
  const inView = selected && selected.endMs > visible.startMs && selected.startMs < visible.endMs
  const viewMs = (input.widthPx * 1000) / next.pxPerSecond
  const scrollMs = inView ? revealScrollMs(next.scrollMs, viewMs, selected) : next.scrollMs
  applyView({ ...next, scrollMs: makeTimeScale({ ...input, ...next, scrollMs }).scrollMs })
}

/**
 * Zooms in or out by one step of the `+` or `-` key, and keeps the selected mark, the play cursor or the centre in place.
 * @param durationMs The duration of the open song.
 * @param direction 1 zooms in, -1 zooms out.
 */
export function zoomByKey(durationMs: number, direction: 1 | -1): void {
  zoomKeepingPlace(durationMs, (anchorMs) =>
    zoomStep(currentStageInput(durationMs), direction, anchorMs),
  )
}

/**
 * Sets the zoom of the slider, and keeps the selected mark, the play cursor or the centre in place.
 * @param durationMs The duration of the open song.
 * @param pxPerSecond The zoom in pixels for each second.
 */
export function zoomTo(durationMs: number, pxPerSecond: number): void {
  zoomKeepingPlace(durationMs, (anchorMs) =>
    zoomAround(currentStageInput(durationMs), pxPerSecond, anchorMs),
  )
}

/**
 * Changes the zoom by `ZOOM_KEY_RATIO` for each step, for a key on the zoom slider.
 * @param durationMs The duration of the open song.
 * @param steps A positive count zooms in, and a negative count zooms out.
 */
export function zoomBySteps(durationMs: number, steps: number): void {
  const input = currentStageInput(durationMs)
  zoomTo(durationMs, ratioZoom(makeTimeScale(input).pxPerMs * 1000, steps))
}

/** Returns the range that "Zoom to selection" shows: the selected marks, else the time selection, else undefined. */
export function zoomTarget(): TimeRange | undefined {
  return selectedNow() ?? useViewStore.getState().selection ?? undefined
}

/**
 * Shows the selected marks, or the time selection, in the middle of the stage with a margin.
 * Returns false when nothing is selected, so the key goes on and the caller can state the reason.
 * @param durationMs The duration of the open song.
 */
export function zoomToSelection(durationMs: number): boolean {
  const range = zoomTarget()
  if (range === undefined) return false
  applyView(zoomToRange(currentStageInput(durationMs), range))
  return true
}

/** Shows the full song in the stage, the same as a song that opens for the first time. */
export function fitSong(): void {
  const view = useViewStore.getState()
  view.setZoom(null)
  view.setScroll(0)
}

/**
 * `Z`: runs "Zoom to selection" on the open song.
 * With nothing selected, the status line states the reason, and the key goes on to the browser.
 */
export function zoomSelectionKey(): boolean {
  const durationMs = useSongStore.getState().current?.song.durationMs
  if (durationMs === undefined) return false
  if (zoomToSelection(durationMs)) return true
  reportStatus(blockText('select-mark-or-range'))
  return false
}
