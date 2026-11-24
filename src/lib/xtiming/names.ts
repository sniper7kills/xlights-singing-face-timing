/** The name part of the timing track for the phrases outside every section. */
export const UNSECTIONED = 'Unsectioned'

/**
 * Returns the key of a timing track name in `ExportOptions.trackNames`.
 * @param voiceId The id of the voice.
 * @param sectionId The id of the section. `null` for grouping by voice. `UNSECTIONED` for the phrases outside every section.
 */
export function trackKey(voiceId: string, sectionId: string | null): string {
  return sectionId === null ? voiceId : `${voiceId}:${sectionId}`
}

/**
 * Returns the default timing track name.
 * @param voiceName The name of the voice.
 * @param sectionName The name of the section. `null` for grouping by voice. `UNSECTIONED` for the phrases outside every section.
 */
export function defaultTrackName(voiceName: string, sectionName: string | null): string {
  return sectionName === null ? voiceName : `${voiceName} - ${sectionName}`
}

// Windows refuses these characters in a file name, and `/` separates folders on every system.
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|]/g

/**
 * Returns the name of the file that holds all timing tracks: `<song name>.xtiming`.
 * The function replaces each of `\ / : * ? " < > |` with `_`.
 * @param songName The name of the song.
 */
export function songFileName(songName: string): string {
  return `${songName}.xtiming`.replace(UNSAFE_FILE_CHARACTERS, '_')
}

/**
 * Returns the name of the file for one timing track: `<song name> - <timing track name>.xtiming`.
 * The function replaces each of `\ / : * ? " < > |` with `_`.
 * @param songName The name of the song.
 * @param trackName The name of the timing track.
 */
export function trackFileName(songName: string, trackName: string): string {
  return `${songName} - ${trackName}.xtiming`.replace(UNSAFE_FILE_CHARACTERS, '_')
}
