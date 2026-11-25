import type { KeyboardEvent } from 'react'
import { blockText } from '../../lib/marks/editBlocks.ts'
import { selectionRange } from '../../lib/marks/selection.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { ReasonButton } from './ReasonButton.tsx'
import { reportStatus } from './statusStore.ts'
import { MAX_ZOOM, MIN_ZOOM, shownZoom } from './timeScale.ts'
import { useEditorKeys } from './useEditorKeys.ts'
import { useStageScale } from './useStageScale.ts'
import { fitSong, zoomByKey, zoomBySteps, zoomTo, zoomToSelection } from './zoomCommands.ts'

/** The steps of one key on the slider. Page Up and Page Down take 5 steps. */
const SLIDER_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 5,
  PageDown: -5,
}

/**
 * Shows the zoom slider from 10 to 1 000 pixels for each second, "Zoom to selection" and "Fit song".
 * It registers the `+` and `-` keys. `Z` is in the shortcut table.
 * The slider and the keys keep the selected mark, the play cursor or the centre of the stage in place. See `zoomAnchorMs`.
 * A key on the slider changes the zoom by a ratio, so each press has the same effect at each zoom.
 * @param durationMs The duration of the open song in milliseconds.
 */
export function ZoomControl({ durationMs }: { durationMs: number }) {
  const { input } = useStageScale(durationMs)
  const zoom = shownZoom(input)
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const timeSelection = useViewStore((view) => view.selection)
  const marks = useSongStore((state) => state.current?.marks)
  const canZoom =
    selectionRange(marks ?? [], selectedMarkIds) !== undefined || timeSelection !== null

  const zoomIn = () => zoomByKey(durationMs, 1)
  const zoomOut = () => zoomByKey(durationMs, -1)
  // `=` is the `+` key without Shift on many keyboards.
  useEditorKeys({ '+': zoomIn, '=': zoomIn, '-': zoomOut })

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    const steps = SLIDER_STEPS[event.key]
    if (steps === undefined) return
    // The editor shortcuts also read the arrow keys, so the slider takes the key first.
    event.preventDefault()
    zoomBySteps(durationMs, steps)
  }

  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      <label>
        Zoom
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={1}
          value={zoom}
          aria-valuetext={`${zoom} pixels for each second`}
          onKeyDown={onSliderKey}
          onChange={(event) => zoomTo(durationMs, Number(event.target.value))}
        />
      </label>
      <ReasonButton
        aria-keyshortcuts="Z"
        reason={canZoom ? null : blockText('select-mark-or-range')}
        hint="Show the selected marks or the time selection"
        shortcut="Z"
        onBlocked={reportStatus}
        onAct={() => zoomToSelection(durationMs)}
      >
        Zoom to selection
      </ReasonButton>
      <ReasonButton reason={null} hint="Show the full song" onAct={fitSong}>
        Fit song
      </ReasonButton>
    </div>
  )
}
