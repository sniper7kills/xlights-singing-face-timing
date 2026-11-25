import type { Mark } from '../../store/types.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { selectionRange } from './selection.ts'

/** The loop plays this much audio before the start of the selection, so the person hears the lead-in of the first sound. */
export const LOOP_LEAD_MS = 150

/**
 * Returns the range that the loop plays, or null when nothing is selected.
 * The range goes from 150 ms before the start of the selection to its end, and starts at 0 or later.
 * The selection is the selected marks, from the earliest start to the latest end.
 * When no selected id names a mark, the selection is the time selection.
 * @param marks All marks of the open song.
 * @param selectedIds The ids of the selected marks.
 * @param timeSelection The time selection, or null.
 */
export function loopRange(
  marks: readonly Mark[],
  selectedIds: readonly string[],
  timeSelection: TimeRange | null,
): TimeRange | null {
  const range = selectionRange(marks, selectedIds) ?? timeSelection
  if (range === null || range.endMs <= range.startMs) return null
  return { startMs: Math.max(0, range.startMs - LOOP_LEAD_MS), endMs: range.endMs }
}
