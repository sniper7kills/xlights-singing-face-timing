import { formatTime } from '../../lib/time/formatTime.ts'
import { msToPx, rulerTicks, type TimeScale } from './timeScale.ts'

type TimeRulerProps = {
  scale: TimeScale
  widthPx: number
}

/** Shows a tick and its time at regular steps of the visible time range. */
export function TimeRuler({ scale, widthPx }: TimeRulerProps) {
  return (
    // The play time output gives the same information to a screen reader.
    <div className="time-ruler" aria-hidden="true">
      {rulerTicks(scale, widthPx).map((ms) => (
        <span key={ms} className="tick" style={{ left: `${msToPx(scale, ms)}px` }}>
          {formatTime(ms)}
        </span>
      ))}
    </div>
  )
}
