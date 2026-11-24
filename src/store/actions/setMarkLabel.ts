import { phraseWordsChange, previewLabel } from '../../lib/marks/labelRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit, newMarkId } from './commitMarkEdit.ts'

/**
 * Sets the label of a mark of the open song, as one undo step. The rules are those of `previewLabel`.
 *
 * - A label that is empty after a trim keeps the old label and records no step.
 * - A new word label clears `edited` and breaks down the word again.
 *   The old phonemes, which the person can have changed by hand, do not fit the new word.
 * - A new phrase label with the same words changes only the label.
 * - A new phrase label with other words keeps the times of the words that match, spreads the new words,
 *   and breaks down each new or changed word. Call `wordsWouldChange` first to ask for a confirm.
 * - A phoneme label must be one of the ten phoneme labels, the same as `setPhonemeLabel`.
 *
 * The break down needs the dictionary in memory. When it is not, each new word gets the phonemes of the rule-based guess.
 * @param id The id of the mark. An unknown id changes nothing.
 * @param label The new label.
 */
export function setMarkLabel(id: string, label: string): void {
  useSongStore
    .getState()
    .apply((content) =>
      commitMarkEdit(
        content,
        previewLabel(content.marks, id, label, content.song.frameMs, newMarkId),
      ),
    )
}

/**
 * Returns true when `setMarkLabel` with the label changes the words of the phrase of the open song.
 * The editor shows the confirm dialog only then. The comparison ignores case and punctuation.
 * Returns false when no song is open, the mark is no phrase, or the label is empty after a trim.
 * @param phraseId The id of the phrase.
 * @param label The new label.
 */
export function wordsWouldChange(phraseId: string, label: string): boolean {
  const content = useSongStore.getState().current
  return content !== null && phraseWordsChange(content.marks, phraseId, label)
}
