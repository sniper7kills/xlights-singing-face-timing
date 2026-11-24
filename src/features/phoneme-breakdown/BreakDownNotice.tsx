import { breakDownWords } from '../../store/actions/breakDown.ts'
import {
  type BreakDownFailure,
  breakDownFailureMessage,
} from '../transcription/runTranscription.ts'

type BreakDownNoticeProps = {
  /** The failure to show. Null shows nothing. */
  failure: BreakDownFailure | null
  /** Receives null after a retry that breaks down the words, or the new failure. */
  onChange: (failure: BreakDownFailure | null) => void
}

/**
 * Shows a break down that did not run, with a "Retry" button that breaks down the same words.
 * A failed retry shows the copy of the feature file, never the raw text of the error.
 */
export function BreakDownNotice({ failure, onChange }: BreakDownNoticeProps) {
  if (failure === null) return null
  const retry = () =>
    breakDownWords(failure.wordIds).then(
      () => onChange(null),
      (error: unknown) =>
        onChange({ message: breakDownFailureMessage(error), wordIds: failure.wordIds }),
    )
  return (
    <p className="message" role="alert">
      {failure.message}{' '}
      <button type="button" className="button" onClick={() => void retry()}>
        Retry
      </button>
    </p>
  )
}
