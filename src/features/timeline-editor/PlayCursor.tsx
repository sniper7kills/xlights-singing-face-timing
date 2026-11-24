import { useViewStore } from '../../store/viewStore.ts'
import { msToPx } from './timeScale.ts'
import { useStageScale } from './useStageScale.ts'

/**
 * Shows the play cursor: one line across the time ruler, the waveform and the layers.
 * The cursor shows only while the play time is in view.
 * @param durationMs The duration of the open song in milliseconds.
 */
export function PlayCursor({ durationMs }: { durationMs: number }) {
  const playTimeMs = useViewStore((view) => view.playTimeMs)
  const { input, scale } = useStageScale(durationMs)
  const x = msToPx(scale, playTimeMs)
  if (x < 0 || x > input.widthPx) return null
  return (
    // The play time output gives the same information to a screen reader.
    <div
      className="play-cursor"
      data-testid="play-cursor"
      aria-hidden="true"
      // A transform moves the line on each animation frame without a new layout.
      style={{ transform: `translateX(${x}px)` }}
    />
  )
}
