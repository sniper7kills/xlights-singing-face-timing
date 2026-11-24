import { useMemo } from 'react'
import type { Layer, Mark, SongContent } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { LayerRow } from './LayerRow.tsx'
import { inRange, visibleRange } from './timeScale.ts'
import { useStageScale } from './useStageScale.ts'

export type LayersProps = {
  /** Receives a click on the "Transcribe" button of the empty state. Without it, the empty state has no button. */
  onTranscribe?: () => void
  /** The open song. */
  content: SongContent
}

const ROWS: { layer: Layer; name: string }[] = [
  { layer: 'phrase', name: 'Phrases' },
  { layer: 'word', name: 'Words' },
  { layer: 'phoneme', name: 'Phonemes' },
]

/**
 * Shows the phrase layer, the word layer and the phoneme layer of the selected voice.
 * The layers use the time scale of the stage.
 * A voice with no marks shows the empty state.
 */
export function Layers({ onTranscribe, content }: LayersProps) {
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const { input, scale } = useStageScale(content.song.durationMs)

  const voiceId = selectedVoice(content.voices, selectedVoiceId)?.id
  const marksByLayer = useMemo(() => {
    const groups: Record<Layer, Mark[]> = { phrase: [], word: [], phoneme: [] }
    for (const mark of content.marks) if (mark.voiceId === voiceId) groups[mark.layer].push(mark)
    // The database returns the marks in key order, and a screen reader reads them in DOM order.
    for (const marks of Object.values(groups)) marks.sort((a, b) => a.startMs - b.startMs)
    return groups
  }, [content.marks, voiceId])
  const empty = ROWS.every(({ layer }) => marksByLayer[layer].length === 0)

  // The layers draw only the marks in view, so a song with 3 000 marks scrolls at 60 frames per second.
  const range = visibleRange(scale, input.widthPx)

  return (
    <section className="layers" aria-label="Layers">
      {empty ? (
        <div className="layers-empty">
          <p>No marks yet. Select Transcribe to find the words.</p>
          {onTranscribe !== undefined && (
            <button type="button" className="button primary" onClick={onTranscribe}>
              Transcribe
            </button>
          )}
        </div>
      ) : (
        ROWS.map(({ layer, name }) => (
          <LayerRow
            key={layer}
            name={name}
            marks={inRange(marksByLayer[layer], range)}
            scale={scale}
          />
        ))
      )}
    </section>
  )
}
