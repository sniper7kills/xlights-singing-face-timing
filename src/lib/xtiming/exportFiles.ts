import { songFileName, trackFileName } from './names.ts'
import type { ExportOptions, ExportTrack } from './types.ts'
import { writeXtiming } from './writeXtiming.ts'

/** The `SourceVersion` value of every file. It matches the value in the xLights round-trip tests. */
export const SOURCE_VERSION = '2024.01'

/** One `.xtiming` file that the export gives to the browser. */
export interface ExportFile {
  /** The file name, with the unsafe characters replaced. */
  name: string
  /** The file text. Encode it as UTF-8. */
  text: string
}

/**
 * Returns the `.xtiming` files of an export: their names and their texts.
 * Packaging `one-file` gives one file with all timing tracks, named `<song name>.xtiming`.
 * Packaging `file-per-track` gives one file for each timing track, named `<song name> - <timing track name>.xtiming`.
 * No timing track gives no file.
 * @param tracks The timing tracks from `buildTracks`.
 * @param songName The name of the song.
 * @param packaging The packaging of the export options.
 */
export function exportFiles(
  tracks: ExportTrack[],
  songName: string,
  packaging: ExportOptions['packaging'],
): ExportFile[] {
  if (tracks.length === 0) return []
  if (packaging === 'one-file') {
    return [{ name: songFileName(songName), text: writeXtiming(tracks, SOURCE_VERSION) }]
  }
  return tracks.map((track) => ({
    name: trackFileName(songName, track.name),
    text: writeXtiming([track], SOURCE_VERSION),
  }))
}
