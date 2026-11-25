import { defaultTrackNames } from '../../lib/xtiming/names.ts'
import type { ExportOptions } from '../../lib/xtiming/types.ts'
import { loadExportOptions, type StoredExportOptions } from '../../store/db.ts'
import type { SongContent } from '../../store/types.ts'

/** The choices of the person in the export dialog: the export options and the zip file choice. */
export type DialogExportOptions = Omit<StoredExportOptions, 'knownVoiceIds'>

/**
 * Returns the ids of the voices that have one mark or more, in the order of the voices.
 * A voice with no marks gives a warning in the checks, so the dialog does not select it for the person.
 */
function voicesWithMarks(content: SongContent): string[] {
  const sung = new Set(content.marks.map((mark) => mark.voiceId))
  return content.voices.map((voice) => voice.id).filter((id) => sung.has(id))
}

/**
 * Returns the export options of a first export of the song.
 * Every voice with marks is selected, with one timing track for each voice in one file and no rest phonemes.
 * @param content The open song with its voices and marks.
 */
export function defaultExportOptions(content: SongContent): ExportOptions {
  return {
    voiceIds: voicesWithMarks(content),
    grouping: 'voice',
    packaging: 'one-file',
    writeRest: false,
    trackNames: {},
  }
}

/**
 * Returns the export options that the dialog opens with for the song.
 *
 * The options of the previous export of the song apply, with these changes:
 * - A voice that the song no longer has leaves the voice list.
 * - A voice that the person added after the previous export is selected.
 * - A voice with no marks is not selected, also when the previous export selected it.
 * - The name of a timing track leaves the options when its voice or its section no longer exists.
 * - Grouping `voice-section` becomes `voice` when the song has no sections.
 *
 * With no previous export, the function returns the options of `defaultExportOptions`.
 * @param content The open song with its voices, sections and marks.
 * Rejects if the database cannot read the options.
 */
export async function loadSongExportOptions(content: SongContent): Promise<DialogExportOptions> {
  const stored = await loadExportOptions(content.song.id)
  if (!stored) return defaultExportOptions(content)
  const { knownVoiceIds, ...options } = stored
  const trackKeys = defaultTrackNames(content.voices, content.sections)
  return {
    ...options,
    voiceIds: voicesWithMarks(content).filter(
      (id) => options.voiceIds.includes(id) || !knownVoiceIds.includes(id),
    ),
    grouping: content.sections.length === 0 ? 'voice' : options.grouping,
    trackNames: Object.fromEntries(
      Object.entries(options.trackNames).filter(([key]) => trackKeys.has(key)),
    ),
  }
}
