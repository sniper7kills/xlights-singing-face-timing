import { useShallow } from 'zustand/react/shallow'
import { breakDownWords } from '../../store/actions/breakDown.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import {
  type BreakDownFailure,
  breakDownFailureMessage,
} from '../transcription/runTranscription.ts'

type BreakDownAgainActionProps = {
  /** Receives the failure when the dictionary does not load. The editor shows it with a "Retry" button. */
  onFailure: (failure: BreakDownFailure) => void
}

const NO_WORDS: Mark[] = []

/**
 * Shows "Break down again" when one word or more is selected. A press breaks down the selected words again.
 * An edited word keeps its phonemes. The tooltip tells this, and the button is disabled when every selected word is edited.
 */
export function BreakDownAgainAction({ onFailure }: BreakDownAgainActionProps) {
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const words = useSongStore(
    useShallow((state) =>
      selectedMarkIds.length === 0
        ? NO_WORDS
        : (state.current?.marks ?? NO_WORDS).filter(
            (mark) => mark.layer === 'word' && selectedMarkIds.includes(mark.id),
          ),
    ),
  )
  if (words.length === 0) return null
  const allEdited = words.every((word) => word.edited)
  const wordIds = words.map((word) => word.id)
  const run = () =>
    breakDownWords(wordIds).catch((error: unknown) =>
      onFailure({ message: breakDownFailureMessage(error), wordIds }),
    )
  return (
    <button
      type="button"
      className="button"
      disabled={allEdited}
      title="An edited word keeps its phonemes."
      onClick={() => void run()}
    >
      Break down again
    </button>
  )
}
