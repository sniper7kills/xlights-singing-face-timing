import { useId, useMemo } from 'react'
import { ghostBars } from '../../store/selectors.ts'
import type { SongContent } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { inRange, rangeToPx, visibleRange } from '../timeline-editor/timeScale.ts'
import { useStageScale } from '../timeline-editor/useStageScale.ts'

/** The height of one lane of the ghost row in pixels: a 6 px bar and a 4 px gap. */
const LANE_PX = 10

/**
 * Shows the "Other voices" row under the phoneme layer: one thin bar for each phrase of each voice that the
 * layers do not show, in the colour of its voice. Each voice with a phrase gets its own lane.
 * The row draws only the bars in view, the same as the layers.
 * It does not read the play time, so it does not draw again during play.
 * The text of each bar names the voice, so the row does not rely on colour alone. A click on a bar does nothing.
 * A song with one voice has no ghost row.
 * @param content The open song.
 */
export function GhostRow({ content }: { content: SongContent }) {
  const nameId = useId()
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const { input, scale } = useStageScale(content.song.durationMs)
  const shownVoiceId = selectedVoice(content.voices, selectedVoiceId)?.id
  const bars = useMemo(
    () => ghostBars(content.voices, content.marks, shownVoiceId),
    [content.voices, content.marks, shownVoiceId],
  )
  if (content.voices.length < 2) return null
  // The lane count comes from every bar, so the row keeps its height during a scroll.
  const lanes = Math.max(1, ...bars.map((bar) => bar.lane + 1))
  return (
    <div className="ghost-row">
      <span id={nameId} className="layer-name">
        Other voices
      </span>
      <ul
        className="ghost-track"
        aria-labelledby={nameId}
        style={{ height: `${lanes * LANE_PX}px` }}
      >
        {inRange(bars, visibleRange(scale, input.widthPx)).map((bar) => {
          const { leftPx, widthPx } = rangeToPx(scale, bar)
          const text = `${bar.voiceName}: ${bar.label}`
          return (
            <li
              key={bar.id}
              className="ghost-bar"
              data-voice-id={bar.voiceId}
              title={text}
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                top: `${bar.lane * LANE_PX}px`,
                background: bar.color,
              }}
            >
              <span className="visually-hidden">{text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
