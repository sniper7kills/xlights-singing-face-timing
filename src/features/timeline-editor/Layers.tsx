import { useMemo } from 'react'
import type { Layer, Mark, SongContent } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { LayerRow } from './LayerRow.tsx'
import { editLabel, stepSelection } from './markCommands.ts'
import { PhraseLabelDialog } from './PhraseLabelDialog.tsx'
import { inRange, visibleRange } from './timeScale.ts'
import { useEditorKeys } from './useEditorKeys.ts'
import { useStageScale } from './useStageScale.ts'

export type LayersProps = {
  /** Receives a click on the "Transcribe" button of the empty state. Without it, the empty state has no button. */
  onTranscribe?: () => void
  /** The open song. */
  content: SongContent
}

/** Returns the id of the mark that has the focus when the key comes from a mark. */
function focusedMarkId(event: KeyboardEvent): string | undefined {
  const { target } = event
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>('[data-mark-id]')?.dataset.markId
}

/** Returns true when the key comes from a mark, or from the page with no focused control. */
function fromMarkOrPage(event: KeyboardEvent): boolean {
  return event.target === document.body || focusedMarkId(event) !== undefined
}

function step(event: KeyboardEvent, direction: 1 | -1): boolean {
  const id = focusedMarkId(event)
  return id !== undefined && stepSelection(id, direction)
}

function editSelected(event: KeyboardEvent): boolean {
  const { selectedMarkIds } = useViewStore.getState()
  const id = selectedMarkIds.length === 1 ? selectedMarkIds[0] : undefined
  return fromMarkOrPage(event) && id !== undefined && editLabel(id)
}

function clearSelection(event: KeyboardEvent): boolean {
  const view = useViewStore.getState()
  if (!fromMarkOrPage(event) || view.selectedMarkIds.length === 0) return false
  view.selectMarks([])
  return true
}

/**
 * The keys of the mark controls. Each returns false when it does not apply, so a button or a link keeps its key.
 * - `Tab` and `Shift+Tab` on a mark select the next or the previous mark on its layer.
 *   On the last or the first mark, the focus leaves the layer.
 * - `Enter` and `F2` open the label control of the only selected mark.
 * - `Escape` clears the mark selection.
 */
const MARK_KEYS = {
  Tab: (event: KeyboardEvent) => step(event, 1),
  'Shift+Tab': (event: KeyboardEvent) => step(event, -1),
  Enter: editSelected,
  F2: editSelected,
  Escape: clearSelection,
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
  useEditorKeys(MARK_KEYS)

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
      {empty || voiceId === undefined ? (
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
            layer={layer}
            voiceId={voiceId}
            marks={inRange(marksByLayer[layer], range)}
            scale={scale}
          />
        ))
      )}
      <PhraseLabelDialog />
    </section>
  )
}
