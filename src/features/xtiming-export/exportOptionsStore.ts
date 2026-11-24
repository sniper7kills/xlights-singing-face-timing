import { defaultTrackNames } from '../../lib/xtiming/names.ts'
import type { ExportOptions } from '../../lib/xtiming/types.ts'
import { loadExportOptions } from '../../store/db.ts'
import type { SongContent } from '../../store/types.ts'

/**
 * Returns the export options of a first export of the song.
 * Every voice is selected, with one timing track for each voice in one file and no rest phonemes.
 * @param content The open song with its voices.
 */
export function defaultExportOptions(content: SongContent): ExportOptions {
  return {
    voiceIds: content.voices.map((voice) => voice.id),
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
 * - The name of a timing track leaves the options when its voice or its section no longer exists.
 * - Grouping `voice-section` becomes `voice` when the song has no sections.
 *
 * With no previous export, the function returns the options of `defaultExportOptions`.
 * @param content The open song with its voices and sections.
 * Rejects if the database cannot read the options.
 */
export async function loadSongExportOptions(content: SongContent): Promise<ExportOptions> {
  const stored = await loadExportOptions(content.song.id)
  if (!stored) return defaultExportOptions(content)
  const { knownVoiceIds, ...options } = stored
  const trackKeys = defaultTrackNames(content.voices, content.sections)
  return {
    ...options,
    voiceIds: content.voices
      .map((voice) => voice.id)
      .filter((id) => options.voiceIds.includes(id) || !knownVoiceIds.includes(id)),
    grouping: content.sections.length === 0 ? 'voice' : options.grouping,
    trackNames: Object.fromEntries(
      Object.entries(options.trackNames).filter(([key]) => trackKeys.has(key)),
    ),
  }
}
