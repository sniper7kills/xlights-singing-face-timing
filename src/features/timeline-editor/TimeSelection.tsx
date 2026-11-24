import { useViewStore } from '../../store/viewStore.ts'
import { rangeToPx } from './timeScale.ts'
import { useStageScale } from './useStageScale.ts'

/**
 * Shows the time selection as a band across the time ruler, the waveform and the layers.
 * @param durationMs The duration of the open song in milliseconds.
 */
export function TimeSelection({ durationMs }: { durationMs: number }) {
  const selection = useViewStore((view) => view.selection)
  const { scale } = useStageScale(durationMs)
  if (selection === null) return null
  const { leftPx, widthPx } = rangeToPx(scale, selection)
  return (
    // The range choice of the transcribe dialog names the times for a screen reader.
    <div
      className="time-selection"
      data-testid="time-selection"
      aria-hidden="true"
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
    />
  )
}
