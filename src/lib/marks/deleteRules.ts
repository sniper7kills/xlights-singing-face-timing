import type { Mark } from '../../store/types.ts'
import { childrenOf, descendantsOf, findMark } from './family.ts'
import type { MarkEdit } from './markEdit.ts'

function removePhoneme(marks: readonly Mark[], phoneme: Mark, removed: Set<string>): void {
  if (phoneme.parentId === null || removed.has(phoneme.id)) return
  const left = childrenOf(marks, phoneme.parentId).filter((item) => !removed.has(item.id))
  // A word always keeps one phoneme or more. The person deletes the word instead.
  if (left.length > 1) removed.add(phoneme.id)
}

/**
 * Returns the legal result of a delete of the marks.
 *
 * The rules:
 * - A deleted phrase takes its words and their phonemes with it.
 * - A deleted word takes its phonemes with it.
 * - The last phoneme of a word stays. The rule ignores its id.
 *   If the ids hold all phonemes of a word, the phoneme that comes last in time order stays.
 * - A deleted phoneme sets `edited` on its word. The phonemes next to it keep their times.
 *
 * @param marks The marks of the song.
 * @param ids The ids of the marks to delete. An unknown id changes nothing.
 */
export function previewDelete(marks: readonly Mark[], ids: readonly string[]): MarkEdit {
  const targets = ids
    .map((id) => findMark(marks, id))
    .filter((mark): mark is Mark => mark !== undefined)
  const removed = new Set<string>()
  for (const mark of targets.filter((item) => item.layer !== 'phoneme')) {
    removed.add(mark.id)
    for (const child of descendantsOf(marks, mark.id)) removed.add(child.id)
  }
  const phonemes = targets
    .filter((item) => item.layer === 'phoneme')
    .sort((a, b) => a.startMs - b.startMs)
  for (const phoneme of phonemes) removePhoneme(marks, phoneme, removed)
  const editedWords = new Set(
    phonemes.filter((item) => removed.has(item.id)).map((item) => item.parentId),
  )
  return {
    changed: marks
      .filter((mark) => editedWords.has(mark.id) && !removed.has(mark.id) && !mark.edited)
      .map((word) => ({ ...word, edited: true })),
    removedIds: [...removed],
  }
}
