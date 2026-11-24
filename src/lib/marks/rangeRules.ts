import type { Mark } from '../../store/types.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { previewDelete } from './deleteRules.ts'
import { childrenOf } from './family.ts'
import type { MarkEdit } from './markEdit.ts'
import type { NewId } from './words.ts'

/**
 * Returns true when the mark and the range share time. A mark that only touches an edge of the range does not overlap it.
 * @param mark The mark to test.
 * @param range The range to test.
 */
export function overlapsRange(mark: Mark, range: TimeRange): boolean {
  return mark.startMs < range.endMs && mark.endMs > range.startMs
}

function phraseLabel(words: readonly Mark[]): string {
  return words.map((word) => word.label).join(' ')
}

/** Returns the edit of one phrase that overlaps the range, after the words in `removed` go. */
function cutPhrase(
  marks: readonly Mark[],
  phrase: Mark,
  range: TimeRange,
  removed: ReadonlySet<string>,
  newId: NewId,
): MarkEdit {
  const kept = childrenOf(marks, phrase.id).filter((word) => !removed.has(word.id))
  const before = kept.filter((word) => word.endMs <= range.startMs)
  const after = kept.filter((word) => word.startMs >= range.endMs)
  const lastBefore = before.at(-1)
  const firstAfter = after[0]
  if (firstAfter === undefined)
    return lastBefore === undefined
      ? { changed: [], removedIds: [phrase.id] }
      : {
          changed: [{ ...phrase, endMs: lastBefore.endMs, label: phraseLabel(before) }],
          removedIds: [],
        }
  if (lastBefore === undefined)
    return {
      changed: [{ ...phrase, startMs: firstAfter.startMs, label: phraseLabel(after) }],
      removedIds: [],
    }
  const secondId = newId()
  return {
    changed: [
      { ...phrase, endMs: lastBefore.endMs, label: phraseLabel(before) },
      ...after.map((word) => ({ ...word, parentId: secondId })),
    ],
    removedIds: [],
    added: [{ ...phrase, id: secondId, startMs: firstAfter.startMs, label: phraseLabel(after) }],
  }
}

/**
 * Returns the edit that clears the range on the three layers of one voice, so that new marks fit in the range with no overlap.
 *
 * The rules:
 * - A word that overlaps the range goes with its phonemes.
 * - A phrase that overlaps the range keeps the words that lie outside it.
 *   It ends at the end of its last kept word before the range, or starts at the start of its first kept word after the range.
 *   Word times are multiples of the frame size and one frame size or longer, so the phrase times are too.
 * - A phrase with kept words on both sides of the range becomes two phrases. The first part keeps the id.
 *   The words after the range move to the second part.
 * - A phrase with no kept word goes.
 * - The label of a changed phrase is the labels of its kept words, joined with one space.
 *
 * Marks of other voices and marks that do not overlap the range do not change.
 * @param marks The marks of the song.
 * @param voiceId The voice to clear.
 * @param range The range to clear.
 * @param newId Gives the id of the second part of a divided phrase.
 */
export function previewRangeClear(
  marks: readonly Mark[],
  voiceId: string,
  range: TimeRange,
  newId: NewId,
): MarkEdit {
  const own = marks.filter((mark) => mark.voiceId === voiceId && overlapsRange(mark, range))
  const deleted = previewDelete(
    marks,
    own.filter((mark) => mark.layer === 'word').map((mark) => mark.id),
  )
  const removed = new Set(deleted.removedIds)
  const edits = own
    .filter((mark) => mark.layer === 'phrase')
    .map((phrase) => cutPhrase(marks, phrase, range, removed, newId))
  return {
    changed: [...deleted.changed, ...edits.flatMap((edit) => edit.changed)],
    removedIds: [...deleted.removedIds, ...edits.flatMap((edit) => edit.removedIds)],
    added: edits.flatMap((edit) => edit.added ?? []),
  }
}
