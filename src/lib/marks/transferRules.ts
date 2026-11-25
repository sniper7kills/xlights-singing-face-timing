import type { Mark } from '../../store/types.ts'
import { descendantsOf } from './family.ts'
import { type MarkEdit, noEdit } from './markEdit.ts'
import { overlapsRange } from './rangeRules.ts'
import type { NewId } from './words.ts'

/** A move takes the phrases off the source voice. A copy keeps them there and adds new marks to the target voice. */
export type TransferMode = 'move' | 'copy'

/** Returns the phrases with the ids that are not on the target voice, in time order. */
function sourcePhrases(
  marks: readonly Mark[],
  phraseIds: readonly string[],
  toVoiceId: string,
): Mark[] {
  const ids = new Set(phraseIds)
  return marks
    .filter((mark) => ids.has(mark.id) && mark.layer === 'phrase' && mark.voiceId !== toVoiceId)
    .sort((a, b) => a.startMs - b.startMs)
}

/** Returns true when two of the phrases, in time order, share time. Only phrases of different voices can do that. */
function overlapEachOther(phrases: readonly Mark[]): boolean {
  let previous: Mark | undefined
  for (const phrase of phrases) {
    if (previous !== undefined && overlapsRange(phrase, previous)) return true
    previous = phrase
  }
  return false
}

/**
 * Returns the phrases of the target voice that share time with one of the phrases to transfer.
 * A phrase that only touches an edge does not share time.
 * @param marks The marks of the song.
 * @param phraseIds The ids of the phrases to transfer. Ids of other marks and of phrases on the target voice do not count.
 * @param toVoiceId The target voice.
 */
export function transferConflicts(
  marks: readonly Mark[],
  phraseIds: readonly string[],
  toVoiceId: string,
): Mark[] {
  const phrases = sourcePhrases(marks, phraseIds, toVoiceId)
  return marks.filter(
    (mark) =>
      mark.voiceId === toVoiceId &&
      mark.layer === 'phrase' &&
      phrases.some((phrase) => overlapsRange(mark, phrase)),
  )
}

/** Returns a copy of each mark on the target voice, with new ids and the matching new `parentId`. */
function copies(family: readonly Mark[], toVoiceId: string, newId: NewId): Mark[] {
  const ids = new Map(family.map((mark) => [mark.id, newId()]))
  return family.map((mark) => ({
    ...mark,
    id: ids.get(mark.id) ?? mark.id,
    voiceId: toVoiceId,
    parentId: mark.parentId === null ? null : (ids.get(mark.parentId) ?? mark.parentId),
  }))
}

/**
 * Returns the edit that moves or copies phrases, with their words and phonemes, to another voice.
 *
 * The rules:
 * - Times, labels and the `edited`, `estimated` and `unknown` flags stay.
 * - A move keeps the ids and the `parentId` of each mark, and sets the new `voiceId`.
 * - A copy adds new marks with new ids. The source marks stay.
 * - A phrase of the target voice that shares time with a transferred phrase is a conflict.
 *   With `replace`, the edit removes each conflict phrase with all its words and phonemes. A removed phrase is never cut.
 *   Without `replace`, a conflict gives an empty edit, so the caller asks the person first.
 * - Phrases that share time with one another give an empty edit, because they cannot sit on one voice.
 *
 * No word changes length, so the edit asks for no new break down.
 * @param marks The marks of the song.
 * @param phraseIds The ids of the phrases. Ids of other marks and of phrases on the target voice do not count.
 * @param toVoiceId The target voice.
 * @param mode `move` or `copy`.
 * @param replace True when the person confirmed the removal of the conflict phrases.
 * @param newId Gives the id of each copied mark.
 */
export function previewTransfer(
  marks: readonly Mark[],
  phraseIds: readonly string[],
  toVoiceId: string,
  mode: TransferMode,
  replace: boolean,
  newId: NewId,
): MarkEdit {
  const phrases = sourcePhrases(marks, phraseIds, toVoiceId)
  if (phrases.length === 0 || overlapEachOther(phrases)) return noEdit()
  const conflicts = transferConflicts(marks, phraseIds, toVoiceId)
  if (conflicts.length > 0 && !replace) return noEdit()
  const removedIds = conflicts.flatMap((phrase) => [
    phrase.id,
    ...descendantsOf(marks, phrase.id).map((mark) => mark.id),
  ])
  const family = phrases.flatMap((phrase) => [phrase, ...descendantsOf(marks, phrase.id)])
  if (mode === 'copy') return { changed: [], removedIds, added: copies(family, toVoiceId, newId) }
  return { changed: family.map((mark) => ({ ...mark, voiceId: toVoiceId })), removedIds }
}
