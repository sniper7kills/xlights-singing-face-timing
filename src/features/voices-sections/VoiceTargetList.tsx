import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../../store/songStore.ts'
import { ActionMenu } from './ActionMenu.tsx'

/** The tooltip of "New voice" when the song has 12 voices. */
const FULL_NOTE = 'A song has 12 voices at most.'

type VoiceTargetListProps = {
  /** The accessible name of the list, for example "Move to voice". */
  label: string
  /** The voice that the list does not show, usually the source voice. */
  excludeVoiceId: string
  /** Receives the id of the chosen voice, or `new` for "New voice". */
  onChoose: (target: string | 'new') => void
  /** Receives `Escape` or a focus that leaves the list. See `ActionMenu`. */
  onClose: (refocus: boolean) => void
}

/**
 * Shows the target voices of a move or a copy as a menu: the other voices of the open song in `order`, then "New voice".
 * At 12 voices "New voice" is disabled, with a tooltip that states the limit.
 */
export function VoiceTargetList({
  label,
  excludeVoiceId,
  onChoose,
  onClose,
}: VoiceTargetListProps) {
  const voices = useSongStore((state) => state.current?.voices) ?? []
  const full = voices.length >= MAX_VOICES
  const items = [
    ...voices
      .filter((voice) => voice.id !== excludeVoiceId)
      .map((voice) => ({ label: voice.name, run: () => onChoose(voice.id) })),
    {
      label: 'New voice',
      run: () => onChoose('new'),
      disabled: full,
      note: full ? FULL_NOTE : undefined,
    },
  ]
  return <ActionMenu label={label} items={items} onClose={onClose} />
}
