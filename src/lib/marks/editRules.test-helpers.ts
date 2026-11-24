import type { Mark } from '../../store/types.ts'
import { testMarks } from './fixtures.test-helpers.ts'
import { applyEdit, type MarkEdit } from './markEdit.ts'
import type { NewId } from './words.ts'

/** Returns an id generator that gives `new1`, `new2` and so on, so a test can name the new marks. */
export function counterIds(): NewId {
  let count = 0
  return () => `new${++count}`
}

/** Returns the marks after the edit, by id, so a test reads one mark with `after(edit).w1`. */
export function after(edit: MarkEdit, marks: readonly Mark[] = testMarks()): Record<string, Mark> {
  return Object.fromEntries(applyEdit(marks, edit).map((item) => [item.id, item]))
}

/** Returns the children of the mark after the edit, in time order. */
export function childrenAfter(
  edit: MarkEdit,
  parentId: string,
  marks: readonly Mark[] = testMarks(),
): Mark[] {
  return applyEdit(marks, edit)
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.startMs - b.startMs)
}

/** Returns the start and the end of the mark. */
export function range(item: Mark | undefined): number[] | undefined {
  return item && [item.startMs, item.endMs]
}
