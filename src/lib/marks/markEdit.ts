import type { Mark } from '../../store/types.ts'

/**
 * The result of a rule in `src/lib/marks/`: the marks that change, in their new state, the marks that come, and the ids of the marks that go.
 * Each rule is a pure function that returns the legal result. The store action and the drag preview call the same rule.
 */
export type MarkEdit = {
  /** The new state of each mark that changes. Each id is also in the marks before the edit. */
  changed: Mark[]
  /** The ids of the marks that the edit removes. */
  removedIds: string[]
  /** The new marks. No id is in the marks before the edit. No value means no new mark. */
  added?: Mark[]
  /**
   * The ids of the words that get a new break down when the store applies the edit and the dictionary is in memory.
   * The edit already gives each of these words phonemes, so the result is legal with no dictionary.
   */
  breakDownIds?: string[]
}

/** Returns an edit that changes nothing. */
export function noEdit(): MarkEdit {
  return { changed: [], removedIds: [] }
}

/** Returns true when the edit changes no mark, adds no mark and removes no mark. */
export function isEmptyEdit(edit: MarkEdit): boolean {
  return edit.changed.length === 0 && edit.removedIds.length === 0 && !edit.added?.length
}

/**
 * Returns the marks after the edit, in the order of the input, with the added marks at the end.
 * @param marks The marks before the edit. The function does not change them.
 * @param edit The edit that a rule returns.
 */
export function applyEdit(marks: readonly Mark[], edit: MarkEdit): Mark[] {
  const changed = new Map(edit.changed.map((mark) => [mark.id, mark]))
  const removed = new Set(edit.removedIds)
  return [
    ...marks.filter((mark) => !removed.has(mark.id)).map((mark) => changed.get(mark.id) ?? mark),
    ...(edit.added ?? []),
  ]
}
