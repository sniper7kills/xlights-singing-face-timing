import type { Mark } from '../../store/types.ts'
import { childrenOf, findMark, nextOnLayer } from './family.ts'
import { noEdit, type MarkEdit } from './markEdit.ts'
import { parentWordEdited } from './moveRules.ts'

/**
 * Returns the mark that a merge joins to the mark: the next mark on its layer of its voice, with the same parent.
 * Returns undefined for the last mark of a layer, and for a next mark of a different parent.
 * @param marks The marks of the song.
 * @param mark The first mark of the merge.
 */
export function mergePartner(marks: readonly Mark[], mark: Mark): Mark | undefined {
  const next = nextOnLayer(marks, mark)
  // Each child stays inside its parent, so a merge across a parent edge is not possible.
  return next && next.parentId === mark.parentId ? next : undefined
}

function adopt(marks: readonly Mark[], from: Mark, to: Mark): Mark[] {
  return childrenOf(marks, from.id).map((child) => ({ ...child, parentId: to.id }))
}

function mergeWords(marks: readonly Mark[], first: Mark, next: Mark): MarkEdit {
  const edited = first.edited || next.edited
  const merged = {
    ...first,
    label: `${first.label.trim()}${next.label.trim()}`,
    endMs: next.endMs,
    edited,
  }
  return {
    changed: [merged, ...adopt(marks, next, first)],
    removedIds: [next.id],
    breakDownIds: edited ? [] : [first.id],
  }
}

function mergePhrases(marks: readonly Mark[], first: Mark, next: Mark): MarkEdit {
  return {
    changed: [
      { ...first, label: `${first.label.trim()} ${next.label.trim()}`, endMs: next.endMs },
      ...adopt(marks, next, first),
    ],
    removedIds: [next.id],
  }
}

function mergePhonemes(marks: readonly Mark[], first: Mark, next: Mark): MarkEdit {
  return {
    changed: [{ ...first, endMs: next.endMs, edited: true }, ...parentWordEdited(marks, first)],
    removedIds: [next.id],
  }
}

/**
 * Returns the legal result of a merge of the mark with the next mark on its layer. The merged mark keeps the id of the first mark.
 *
 * The rules:
 * - The next mark is on the same layer of the same voice and has the same parent. Else the edit is empty.
 * - The merged mark spans from the start of the first mark to the end of the next mark.
 * - Two words join their labels with no space. The merged word holds the phonemes of both words.
 *   If neither word is edited, the store breaks down the merged word. Else the merged word is edited and keeps the phonemes.
 * - Two phrases join their labels with one space. The merged phrase keeps the words of both phrases.
 * - Two phonemes keep the label of the first phoneme. The phoneme and its word get `edited`.
 *
 * @param marks The marks of the song.
 * @param id The id of the first mark. An unknown id gives an empty edit.
 */
export function previewMerge(marks: readonly Mark[], id: string): MarkEdit {
  const first = findMark(marks, id)
  const next = first && mergePartner(marks, first)
  if (!first || !next) return noEdit()
  if (first.layer === 'word') return mergeWords(marks, first, next)
  if (first.layer === 'phrase') return mergePhrases(marks, first, next)
  return mergePhonemes(marks, first, next)
}
