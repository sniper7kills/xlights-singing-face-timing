import { useId, useMemo, useRef, useState } from 'react'
import { idsAfterMove, MAX_VOICES, phraseCounts } from '../../lib/voices/voiceRules.ts'
import { addVoice, deleteVoice, reorderVoices } from '../../store/actions/voices.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Voice } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { DeleteVoiceDialog } from './DeleteVoiceDialog.tsx'
import { VoiceRow } from './VoiceRow.tsx'

/** The tooltip and the note of "Add voice" when the song has 12 voices. */
const FULL_NOTE = 'A song has 12 voices at most.'

/**
 * Shows the voice rail on the left of the editor: a row for each voice of the open song in `order`,
 * and the "Add voice" button. A click on a row shows that voice on the layers.
 * At 12 voices "Add voice" is disabled, with a tooltip and a note that state the limit.
 */
export function VoiceRail() {
  const content = useSongStore((state) => state.current)
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const [pending, setPending] = useState<Voice | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const noteId = useId()
  const marks = content?.marks
  const counts = useMemo(() => phraseCounts(marks ?? []), [marks])
  if (content === null) return null
  const { song, voices } = content
  const shown = selectedVoice(voices, selectedVoiceId)
  const full = voices.length >= MAX_VOICES

  function closeDialog(confirmed: boolean) {
    if (confirmed && pending !== null) {
      deleteVoice(pending.id)
      // The deleted row held the control that opened the dialog.
      addButton.current?.focus()
    }
    setPending(null)
  }

  return (
    <aside className="voice-rail" aria-labelledby={titleId}>
      <h3 id={titleId}>Voices</h3>
      <ul className="voice-list">
        {voices.map((voice) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            voices={voices}
            phraseCount={counts.get(voice.id) ?? 0}
            selected={voice.id === shown?.id}
            onMove={(direction) =>
              reorderVoices(song.id, idsAfterMove(voices, voice.id, direction))
            }
            onDelete={() => setPending(voice)}
          />
        ))}
      </ul>
      <button
        ref={addButton}
        type="button"
        className="button voice-add"
        disabled={full}
        title={full ? FULL_NOTE : undefined}
        aria-describedby={full ? noteId : undefined}
        onClick={() => addVoice(song.id)}
      >
        Add voice
      </button>
      {full && (
        <p id={noteId} className="voice-rail-note">
          {FULL_NOTE}
        </p>
      )}
      {pending !== null && <DeleteVoiceDialog name={pending.name} onClose={closeDialog} />}
    </aside>
  )
}
