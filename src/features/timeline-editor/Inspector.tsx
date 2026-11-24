import { useSongStore } from '../../store/songStore.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { FacePreview } from './FacePreview.tsx'
import { MarkFields } from './MarkFields.tsx'

/**
 * Shows the inspector on the right of the editor: the face preview at the top, and under it the fields of the
 * selected mark. The fields show only when exactly one mark is selected, because each field holds one value.
 */
export function Inspector() {
  const content = useSongStore((state) => state.current)
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  if (content === null) return null
  const mark =
    selectedMarkIds.length === 1
      ? content.marks.find((item) => item.id === selectedMarkIds[0])
      : undefined
  return (
    <aside className="inspector" aria-label="Inspector">
      <h3>Face preview</h3>
      <FacePreview voice={selectedVoice(content.voices, selectedVoiceId)} />
      {mark === undefined ? (
        <p className="inspector-hint">Select one mark to see its fields.</p>
      ) : (
        <MarkFields key={mark.id} mark={mark} frameMs={content.song.frameMs} />
      )}
    </aside>
  )
}
