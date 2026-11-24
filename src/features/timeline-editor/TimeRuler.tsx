import type { PointerEvent } from 'react'
import { formatTime } from '../../lib/time/formatTime.ts'
import { msToPx, rulerTicks, timeAtPx } from './timeScale.ts'
import { useStageScale } from './useStageScale.ts'

type TimeRulerProps = {
  /** The duration of the open song in milliseconds. */
  durationMs: number
  /** Receives the time under a click on the ruler, in whole milliseconds. */
  onSeek: (ms: number) => void
}

/** Shows a tick and its time at regular steps of the visible time range. A click moves the play cursor. */
export function TimeRuler({ durationMs, onSeek }: TimeRulerProps) {
  const { input, scale } = useStageScale(durationMs)

  function seek(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const left = event.currentTarget.getBoundingClientRect().left
    onSeek(timeAtPx(scale, event.clientX - left, durationMs))
  }

  return (
    // The play time output gives the same information to a screen reader.
    <div className="time-ruler" aria-hidden="true" onPointerDown={seek}>
      {rulerTicks(scale, input.widthPx).map((ms) => (
        <span key={ms} className="tick" style={{ left: `${msToPx(scale, ms)}px` }}>
          {formatTime(ms)}
        </span>
      ))}
    </div>
  )
}
