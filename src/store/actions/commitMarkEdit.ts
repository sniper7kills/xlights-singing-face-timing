import { applyEdit, isEmptyEdit, type MarkEdit } from '../../lib/marks/markEdit.ts'
import type { Mark, SongContent } from '../types.ts'
import { breakDownMarks, loadedDictionaries } from './breakDown.ts'

function lengthChanged(before: Mark | undefined, after: Mark): boolean {
  return before !== undefined && before.endMs - before.startMs !== after.endMs - after.startMs
}

/**
 * Returns the content after the edit of a rule in `src/lib/marks/`, for a step of `songStore.apply`.
 * Each unedited word that changes length gets a new break down in the same step, when the dictionary is in memory.
 * When it is not, the word keeps the phonemes that the rule spread again, and the step does not fail.
 * Returns the input content when the edit is empty, so the store records no step.
 * @param content The open song.
 * @param edit The edit that the rule returns for the marks of the open song.
 */
export function commitMarkEdit(content: SongContent, edit: MarkEdit): SongContent {
  if (isEmptyEdit(edit)) return content
  const marks = applyEdit(content.marks, edit)
  const dictionaries = loadedDictionaries()
  if (!dictionaries) return { ...content, marks }
  const before = new Map(content.marks.map((mark) => [mark.id, mark]))
  const resized = new Set(
    edit.changed
      .filter((mark) => mark.layer === 'word' && lengthChanged(before.get(mark.id), mark))
      .map((mark) => mark.id),
  )
  const broken = breakDownMarks(
    marks,
    (word) => resized.has(word.id),
    dictionaries,
    content.song.frameMs,
  )
  return { ...content, marks: [...broken] }
}
