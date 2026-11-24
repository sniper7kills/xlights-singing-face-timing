import { phonemeLabelAt } from '../../store/selectors.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import type { Mark, Voice } from '../../store/types.ts'
import { MOUTH_SHAPES } from './mouthShapes.ts'

const NO_MARKS: Mark[] = []

/**
 * Shows a drawn face with the mouth shape of the phoneme of the voice at the play time.
 * With no phoneme at the play time, the face shows the closed mouth and the label `rest`, the same as xLights.
 * The eyes blink during `rest`.
 *
 * The play time changes on each animation frame during play. The component subscribes to the phoneme label only,
 * so it draws again when the label changes, and the layers do not draw again.
 * The label shows as text, so the preview does not rely on colour alone.
 * The text alternative has no live region, so a screen reader does not read each change during play.
 * @param voice The voice of the layers. Undefined is for a song with no voice.
 */
export function FacePreview({ voice }: { voice: Voice | undefined }) {
  const marks = useSongStore((state) => state.current?.marks ?? NO_MARKS)
  const label = useViewStore((view) => phonemeLabelAt(marks, voice?.id, view.playTimeMs)) ?? 'rest'
  return (
    <figure className="face-preview" data-phoneme={label}>
      <div className="face">
        <svg viewBox="0 0 120 120" role="img" aria-label={`Face preview, mouth shape ${label}`}>
          <circle className="face-outline" cx="60" cy="60" r="52" />
          <g className={label === 'rest' ? 'face-eyes blink' : 'face-eyes'}>
            <ellipse cx="42" cy="48" rx="6" ry="8" />
            <ellipse cx="78" cy="48" rx="6" ry="8" />
          </g>
          <path
            className="face-mouth"
            data-testid="mouth"
            d={MOUTH_SHAPES[label]}
            style={{ fill: `var(--p-${label})` }}
          />
        </svg>
      </div>
      <figcaption className="face-caption">
        <span>{voice?.name}</span>
        <b data-testid="face-phoneme">{label}</b>
      </figcaption>
    </figure>
  )
}
