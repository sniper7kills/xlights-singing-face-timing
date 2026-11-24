import { useViewStore } from '../../store/viewStore.ts'
import { MAX_ZOOM, MIN_ZOOM, shownZoom, zoomAt, type ZoomView, zoomStep } from './timeScale.ts'
import { currentStageInput, useStageScale } from './useStageScale.ts'
import { useEditorKeys } from './useEditorKeys.ts'

function applyView({ pxPerSecond, scrollMs }: ZoomView) {
  const view = useViewStore.getState()
  view.setZoom(pxPerSecond)
  view.setScroll(scrollMs)
}

/**
 * Shows the zoom slider from 10 to 1 000 pixels for each second, and registers the `+` and `-` keys.
 * The slider and the keys keep the time at the centre of the stage in place.
 * @param durationMs The duration of the open song in milliseconds.
 */
export function ZoomControl({ durationMs }: { durationMs: number }) {
  const { input } = useStageScale(durationMs)
  const zoom = shownZoom(input)

  const zoomIn = () => applyView(zoomStep(currentStageInput(durationMs), 1))
  const zoomOut = () => applyView(zoomStep(currentStageInput(durationMs), -1))
  // `=` is the `+` key without Shift on many keyboards.
  useEditorKeys({ '+': zoomIn, '=': zoomIn, '-': zoomOut })

  return (
    <label className="zoom-control">
      Zoom
      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={1}
        value={zoom}
        aria-valuetext={`${zoom} pixels for each second`}
        onChange={(event) =>
          applyView(zoomAt(input, Number(event.target.value), input.widthPx / 2))
        }
      />
    </label>
  )
}
