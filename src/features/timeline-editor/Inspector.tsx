import { previewVoices } from '../../store/selectors.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Voice } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { FacePreview } from './FacePreview.tsx'
import { MarkFields } from './MarkFields.tsx'
import { PanelFold } from './PanelFold.tsx'

/**
 * Shows the inspector on the right of the editor: the face preview at the top, and under it the fields of the
 * selected mark. The fields show only when exactly one mark is selected, because each field holds one value.
 * The face preview shows one face for each of the first 4 voices that are not muted, in voice order.
 * It does not depend on the voice that the layers show.
 */
export function Inspector() {
  const content = useSongStore((state) => state.current)
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  if (content === null) return null
  const mark =
    selectedMarkIds.length === 1
      ? content.marks.find((item) => item.id === selectedMarkIds[0])
      : undefined
  const { shown, moreCount } = previewVoices(content.voices)
  // A song with no voice shows one face with no name, so the face preview keeps its place in the inspector.
  const faces: (Voice | undefined)[] = content.voices.length === 0 ? [undefined] : shown
  return (
    <aside className="inspector" aria-label="Inspector">
      <PanelFold panel="inspector" />
      <h3>Face preview</h3>
      {faces.length === 0 ? (
        <p className="inspector-hint">
          Every voice is muted. Select the mute button of a voice to show its face.
        </p>
      ) : (
        <div className="face-grid" data-count={faces.length}>
          {faces.map((voice) => (
            <FacePreview key={voice?.id ?? 'none'} voice={voice} />
          ))}
        </div>
      )}
      {moreCount > 0 && <p className="face-more">+{moreCount} more</p>}
      {mark === undefined ? (
        <p className="inspector-hint">Select one mark to see its fields.</p>
      ) : (
        <MarkFields
          key={mark.id}
          mark={mark}
          frameMs={content.song.frameMs}
          durationMs={content.song.durationMs}
        />
      )}
    </aside>
  )
}
