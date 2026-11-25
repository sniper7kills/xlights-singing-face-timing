import { create } from 'zustand'
import type { TransferMode } from '../../lib/marks/transferRules.ts'
import {
  movePhrases,
  movePhrasesToNewVoice,
  phrasesInTargetRange,
} from '../../store/actions/movePhrases.ts'
import { useViewStore } from '../../store/viewStore.ts'

/** A transfer that waits for the person to confirm the removal of the target phrases in the range. */
export type PendingTransfer = {
  phraseIds: readonly string[]
  toVoiceId: string
  mode: TransferMode
  /** The number of target phrases that the replace removes. */
  count: number
}

/** The store of the pending transfer. `TransferConfirmDialog` shows it. */
export const useTransferStore = create<{ pending: PendingTransfer | null }>()(() => ({
  pending: null,
}))

/** Clears the mark selection after a move, because the layers no longer show the moved phrases. */
function afterTransfer(mode: TransferMode) {
  if (mode === 'move') useViewStore.getState().selectMarks([])
}

/**
 * Starts a move or a copy of phrases to a voice.
 * - For `new`, it adds a voice with the phrases as one undo step.
 * - For a voice with no phrase in the range, it moves or copies the phrases at once.
 * - For a voice with phrases in the range, it keeps the transfer pending until `endTransfer`.
 * @param phraseIds The ids of the phrases, usually the selected marks.
 * @param target The id of the target voice, or `new` for a new voice.
 * @param mode `move` or `copy`.
 */
export function startTransfer(
  phraseIds: readonly string[],
  target: string | 'new',
  mode: TransferMode,
): void {
  if (target === 'new') {
    if (movePhrasesToNewVoice(phraseIds, mode) !== null) afterTransfer(mode)
    return
  }
  const count = phrasesInTargetRange(phraseIds, target)
  if (count > 0) {
    useTransferStore.setState({ pending: { phraseIds, toVoiceId: target, mode, count } })
    return
  }
  movePhrases(phraseIds, target, mode, false)
  afterTransfer(mode)
}

/**
 * Ends the pending transfer. For true, it replaces the target phrases in the range as one undo step.
 * A call with no pending transfer changes nothing.
 * @param confirmed True for "Continue", false for "Cancel".
 */
export function endTransfer(confirmed: boolean): void {
  const { pending } = useTransferStore.getState()
  useTransferStore.setState({ pending: null })
  if (pending === null || !confirmed) return
  movePhrases(pending.phraseIds, pending.toVoiceId, pending.mode, true)
  afterTransfer(pending.mode)
}
