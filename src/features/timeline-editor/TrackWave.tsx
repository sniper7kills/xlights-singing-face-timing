import { useEffect, useRef, useState } from 'react'
import { type TrackPeaks, waveColumns } from '../../lib/audio/peaks.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { useStageScale } from './useStageScale.ts'

type TrackWaveProps = {
  /** The peaks of the track, or undefined while the app computes them. */
  peaks: TrackPeaks | undefined
  gate: readonly TimeRange[] | null
  /** The colour of the waveform, or null for the waveform colour of the theme. */
  color: string | null
  durationMs: number
}

/** Returns a number that changes after each change of the theme, so a canvas draws again in the new colours. */
function useThemeChange(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setCount((value) => value + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return count
}

/** Draws one bar of one pixel width for each column with audio, from the low value to the high value. */
function drawColumns(context: CanvasRenderingContext2D, columns: Float32Array, heightPx: number) {
  const half = heightPx / 2
  for (let x = 0; x * 2 < columns.length; x += 1) {
    const low = columns[x * 2] ?? Number.NaN
    const high = columns[x * 2 + 1] ?? Number.NaN
    if (!Number.isNaN(low))
      context.fillRect(x, half - high * half, 1, Math.max(1, (high - low) * half))
  }
}

/**
 * Draws the waveform of one track row on a canvas, on the time scale of the stage.
 * It draws only the part in view, and it draws again only after a scroll, a zoom, a resize or new peaks.
 */
export function TrackWave({ peaks, gate, color, durationMs }: TrackWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { input, scale } = useStageScale(durationMs)
  const theme = useThemeChange()
  const widthPx = input.widthPx
  const { pxPerMs, scrollMs } = scale

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const heightPx = canvas.clientHeight
    canvas.width = Math.round(widthPx * ratio)
    canvas.height = Math.round(heightPx * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, widthPx, heightPx)
    if (peaks === undefined) return
    context.fillStyle = color ?? getComputedStyle(canvas).getPropertyValue('--wave').trim()
    drawColumns(context, waveColumns(peaks, { pxPerMs, scrollMs }, widthPx, gate), heightPx)
  }, [peaks, gate, color, pxPerMs, scrollMs, widthPx, theme])

  return (
    <canvas ref={canvasRef} className="track-wave" data-testid="track-wave" aria-hidden="true" />
  )
}
