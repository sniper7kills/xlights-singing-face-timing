/** The voice choices of the previous export of a song, as the `settings` object store holds them. */
export type StoredVoiceChoice = {
  /** The selected voices of the previous export. */
  voiceIds: readonly string[]
  /** All voices of the song at the previous export. */
  knownVoiceIds: readonly string[]
  /** The voices that the export left out because they had no marks. Options from before this field have no value. */
  emptyVoiceIds?: readonly string[]
}

/**
 * Returns the voices that the export dialog selects, in the order of `voicesWithMarks`.
 * A voice with marks is selected when one of these is true:
 * - the previous export selected it,
 * - the person added it after the previous export,
 * - the previous export left it out because it had no marks.
 *
 * A voice with marks that the person cleared stays cleared. A voice with no marks is never selected.
 * @param voicesWithMarks The ids of the voices that have one mark or more, in the voice order.
 * @param stored The voice choices of the previous export.
 */
export function selectedExportVoices(
  voicesWithMarks: readonly string[],
  stored: StoredVoiceChoice,
): string[] {
  const empty = stored.emptyVoiceIds ?? []
  return voicesWithMarks.filter(
    (id) =>
      stored.voiceIds.includes(id) || !stored.knownVoiceIds.includes(id) || empty.includes(id),
  )
}

/**
 * Returns the voices that an export leaves out because they have no marks, so the next export selects them when they get marks.
 * @param voiceIds The ids of all voices of the song.
 * @param voicesWithMarks The ids of the voices that have one mark or more.
 * @param selected The ids of the voices that the export selects.
 */
export function emptyUnselectedVoices(
  voiceIds: readonly string[],
  voicesWithMarks: readonly string[],
  selected: readonly string[],
): string[] {
  return voiceIds.filter((id) => !voicesWithMarks.includes(id) && !selected.includes(id))
}
