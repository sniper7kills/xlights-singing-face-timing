import type { Mark } from '../../store/types.ts'

/**
 * The result of a rule in `src/lib/marks/`: the marks that change, in their new state, and the ids of the marks that go.
 * Each rule is a pure function that returns the legal result. The store action and the drag preview call the same rule.
 */
export type MarkEdit = {
  /** The new state of each mark that changes. Each id is also in the marks before the edit. */
  changed: Mark[]
  /** The ids of the marks that the edit removes. */
  removedIds: string[]
}

/** Returns an edit that changes nothing. */
export function noEdit(): MarkEdit {
  return { changed: [], removedIds: [] }
}

/** Returns true when the edit changes no mark and removes no mark. */
export function isEmptyEdit(edit: MarkEdit): boolean {
  return edit.changed.length === 0 && edit.removedIds.length === 0
}

/**
 * Returns the marks after the edit, in the order of the input.
 * @param marks The marks before the edit. The function does not change them.
 * @param edit The edit that a rule returns.
 */
export function applyEdit(marks: readonly Mark[], edit: MarkEdit): Mark[] {
  const changed = new Map(edit.changed.map((mark) => [mark.id, mark]))
  const removed = new Set(edit.removedIds)
  return marks.filter((mark) => !removed.has(mark.id)).map((mark) => changed.get(mark.id) ?? mark)
}
