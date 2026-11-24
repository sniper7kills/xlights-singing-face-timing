import { addPlace, previewAdd } from '../../lib/marks/addRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Layer } from '../types.ts'
import { commitMarkEdit, newMarkId } from './commitMarkEdit.ts'

/**
 * Adds a mark to the open song in an empty range of a layer, as one undo step. The rules are those of `previewAdd`.
 * The times snap to the frame size, and the mark is clamped to the empty range around `startMs`.
 * A new word gets a break down in the same step, when the dictionary is in memory.
 * A call that is not possible changes nothing and records no step.
 * @param voiceId The voice of the mark.
 * @param layer The layer of the mark.
 * @param startMs The start of the range. The empty range around this time receives the mark.
 * @param endMs The end of the range.
 * @param label The label. A phrase or a word needs a label that is not empty. A phoneme needs one of the ten phoneme labels.
 */
export function addMark(
  voiceId: string,
  layer: Layer,
  startMs: number,
  endMs: number,
  label: string,
): void {
  useSongStore
    .getState()
    .apply((content) =>
      commitMarkEdit(
        content,
        previewAdd(
          content.marks,
          { voiceId, layer, startMs, endMs, label },
          content.song.frameMs,
          content.song.durationMs,
          newMarkId,
        ),
      ),
    )
}

/**
 * Returns true when the layer of the voice has an empty range of one frame size or more for a mark at the times.
 * The label is not part of the query, so the editor can enable the add before the person types the label.
 * Returns false in these cases:
 * - No song is open.
 * - A mark of the layer holds `startMs`.
 * - The clamped range is shorter than one frame size.
 * - The layer is the phoneme layer and no word holds `startMs`.
 * @param voiceId The voice of the mark.
 * @param layer The layer of the mark.
 * @param startMs The start of the range.
 * @param endMs The end of the range.
 */
export function canAddMark(voiceId: string, layer: Layer, startMs: number, endMs: number): boolean {
  const content = useSongStore.getState().current
  if (!content) return false
  const input = { voiceId, layer, startMs, endMs, label: '' }
  return addPlace(content.marks, input, content.song.frameMs, content.song.durationMs) !== undefined
}
