import { useMemo } from 'react'
import { blockText } from '../../lib/marks/editBlocks.ts'
import { findMark } from '../../lib/marks/family.ts'
import { otherVoiceHasPhrases } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Layer, Mark, SongContent } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { VoiceHeading } from '../voices-sections/VoiceHeading.tsx'
import { LayerRow } from './LayerRow.tsx'
import { editLabel, selectAndReveal, stepSelection } from './markCommands.ts'
import { PhraseLabelDialog } from './PhraseLabelDialog.tsx'
import { reportStatus } from './statusStore.ts'
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

/** Selects the focused mark. The mark keeps the focus. */
function selectFocused(id: string) {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  if (content && mark) selectAndReveal(mark, content.song.durationMs)
}

/**
 * Selects the previous or the next mark of the layer, from the only selected mark or the focused mark.
 * A focused mark that is not selected gets the selection first, so `]` after `Tab` selects the mark that has the focus.
 * At the first or the last mark of the layer, the status line states it.
 */
function step(event: KeyboardEvent, direction: 1 | -1): boolean {
  const { selectedMarkIds } = useViewStore.getState()
  const focused = focusedMarkId(event)
  if (!fromMarkOrPage(event)) return false
  if (focused !== undefined && !selectedMarkIds.includes(focused)) {
    selectFocused(focused)
    return true
  }
  const id = focused ?? (selectedMarkIds.length === 1 ? selectedMarkIds[0] : undefined)
  if (id === undefined) return false
  if (!stepSelection(id, direction))
    reportStatus(blockText(direction === 1 ? 'last-on-layer' : 'first-on-layer'))
  return true
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
 * - `[` and `]` select the previous or the next mark on the layer. See `step`.
 *   `Tab` keeps the browser order, so each layer is one Tab stop and `Tab` leaves the layers.
 * - `Enter` and `F2` open the label control of the only selected mark.
 * - `Escape` clears the mark selection.
 */
const MARK_KEYS = {
  '[': (event: KeyboardEvent) => step(event, -1),
  ']': (event: KeyboardEvent) => step(event, 1),
  Enter: editSelected,
  F2: editSelected,
  Escape: clearSelection,
}

/** The empty state of a voice when no voice of the song has phrases. */
const EMPTY_TEXT = 'No marks yet. Select Transcribe to find the words.'

/** The empty state of a voice when a different voice of the song has phrases. */
const EMPTY_VOICE_TEXT =
  'This voice has no marks. Select phrases of a different voice, then select "Phrase" and "Move to voice". Or select "Transcribe".'

const ROWS: { layer: Layer; name: string }[] = [
  { layer: 'phrase', name: 'Phrases' },
  { layer: 'word', name: 'Words' },
  { layer: 'phoneme', name: 'Phonemes' },
]

/**
 * Shows the phrase layer, the word layer and the phoneme layer of the selected voice.
 * The layers use the time scale of the stage.
 * A heading above the layers names the shown voice.
 * A voice with no marks shows the empty state. When a different voice has phrases, the text names "Move to voice".
 */
export function Layers({ onTranscribe, content }: LayersProps) {
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const { input, scale } = useStageScale(content.song.durationMs)
  useEditorKeys(MARK_KEYS)

  const voice = selectedVoice(content.voices, selectedVoiceId)
  const voiceId = voice?.id
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
      {voice !== undefined && <VoiceHeading voice={voice} />}
      {empty || voiceId === undefined ? (
        <div className="layers-empty">
          <p>
            {voiceId !== undefined && otherVoiceHasPhrases(content.marks, voiceId)
              ? EMPTY_VOICE_TEXT
              : EMPTY_TEXT}
          </p>
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
