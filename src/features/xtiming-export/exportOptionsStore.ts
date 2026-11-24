import type { ExportOptions } from '../../lib/xtiming/types.ts'
import { loadExportOptions } from '../../store/db.ts'
import type { SongContent } from '../../store/types.ts'

/**
 * Returns the export options that the dialog opens with for the song.
 *
 * The options of the previous export of the song apply, with these changes:
 * - A voice that the song no longer has leaves the voice list.
 * - Grouping `voice-section` becomes `voice` when the song has no sections.
 *
 * With no previous export, every voice is selected, with one timing track for each voice in one file and no rest phonemes.
 * @param content The open song with its voices and sections.
 * Rejects if the database cannot read the options.
 */
export async function loadSongExportOptions(content: SongContent): Promise<ExportOptions> {
  const stored = await loadExportOptions(content.song.id)
  const voiceIds = content.voices.map((voice) => voice.id)
  if (!stored) {
    return { voiceIds, grouping: 'voice', packaging: 'one-file', writeRest: false, trackNames: {} }
  }
  return {
    ...stored,
    voiceIds: stored.voiceIds.filter((id) => voiceIds.includes(id)),
    grouping: content.sections.length === 0 ? 'voice' : stored.grouping,
  }
}
