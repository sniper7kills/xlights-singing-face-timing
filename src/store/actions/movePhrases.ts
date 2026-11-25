import { isEmptyEdit } from '../../lib/marks/markEdit.ts'
import {
  previewTransfer,
  transferConflicts,
  type TransferMode,
} from '../../lib/marks/transferRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Voice } from '../types.ts'
import { commitMarkEdit, newMarkId } from './commitMarkEdit.ts'
import { addVoiceStep } from './voices.ts'

/**
 * Moves or copies phrases of the open song, with their words and phonemes, to another voice, as one undo step.
 * The rules are those of `previewTransfer`.
 * A call that changes nothing records no step: an unknown voice, no phrase off the target voice,
 * or a conflict without `replace`.
 * @param phraseIds The ids of the phrases, usually the selected marks.
 * @param toVoiceId The target voice.
 * @param mode `move` or `copy`.
 * @param replace True when the person confirmed the removal of the target phrases in the range.
 */
export function movePhrases(
  phraseIds: readonly string[],
  toVoiceId: string,
  mode: TransferMode,
  replace: boolean,
): void {
  useSongStore.getState().apply((content) => {
    if (!content.voices.some((voice) => voice.id === toVoiceId)) return content
    return commitMarkEdit(
      content,
      previewTransfer(content.marks, phraseIds, toVoiceId, mode, replace, newMarkId),
    )
  })
}

/**
 * Adds a voice and moves or copies phrases of the open song to it, as one undo step.
 * The new voice gets the name "Voice N" with the lowest free N, and the next unused colour.
 * Returns the new voice, or null when nothing changes: 12 voices, no open song, or no phrase to transfer.
 * @param phraseIds The ids of the phrases, usually the selected marks.
 * @param mode `move` or `copy`.
 */
export function movePhrasesToNewVoice(
  phraseIds: readonly string[],
  mode: TransferMode,
): Voice | null {
  let added: Voice | null = null
  useSongStore.getState().apply((content) => {
    const result = addVoiceStep(content)
    if (result === null) return content
    const edit = previewTransfer(content.marks, phraseIds, result.voice.id, mode, false, newMarkId)
    // A new voice with no phrase is not the result that the person asked for.
    if (isEmptyEdit(edit)) return content
    added = result.voice
    return commitMarkEdit(result.content, edit)
  })
  return added
}

/**
 * Returns the number of phrases of the target voice that a transfer of the phrases removes with `replace`.
 * Returns 0 when no song is open.
 * @param phraseIds The ids of the phrases to transfer.
 * @param toVoiceId The target voice.
 */
export function phrasesInTargetRange(phraseIds: readonly string[], toVoiceId: string): number {
  const marks = useSongStore.getState().current?.marks ?? []
  return transferConflicts(marks, phraseIds, toVoiceId).length
}
