import type { PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'
import { previewPhonemeLabel } from '../../lib/marks/labelRules.ts'
import { useSongStore } from '../songStore.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Sets the label of a phoneme of the open song, as one undo step. The phoneme and its word get `edited`.
 * The label list of the editor is `PHONEME_LABELS` in `src/lib/dictionary/cmuSymbols.ts`.
 * A call that changes nothing records no step.
 * @param id The id of the phoneme. An unknown id or a mark that is no phoneme changes nothing.
 * @param label One of the ten phoneme labels. Any other value changes nothing.
 */
export function setPhonemeLabel(id: string, label: PhonemeLabel): void {
  useSongStore
    .getState()
    .apply((content) => commitMarkEdit(content, previewPhonemeLabel(content.marks, id, label)))
}
