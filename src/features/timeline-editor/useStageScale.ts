import { useViewStore } from '../../store/viewStore.ts'
import { makeTimeScale, type TimeScale, type TimeScaleInput } from './timeScale.ts'

/**
 * Returns the time scale of the stage and its input. The time ruler, the waveform,
 * the layers and the play cursor all read this one scale, so they stay aligned.
 * @param durationMs The duration of the open song in milliseconds.
 */
export function useStageScale(durationMs: number): { input: TimeScaleInput; scale: TimeScale } {
  const pxPerSecond = useViewStore((view) => view.pxPerSecond)
  const scrollMs = useViewStore((view) => view.scrollMs)
  const widthPx = useViewStore((view) => view.stageWidthPx)
  const input = { widthPx, durationMs, pxPerSecond, scrollMs }
  return { input, scale: makeTimeScale(input) }
}

/** Returns the scale input from the view store now, for an event handler that runs between renders. */
export function currentStageInput(durationMs: number): TimeScaleInput {
  const { pxPerSecond, scrollMs, stageWidthPx } = useViewStore.getState()
  return { widthPx: stageWidthPx, durationMs, pxPerSecond, scrollMs }
}
