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

/**
 * Returns the default name of every timing track that an export of the song can have.
 * The key of each name is the key of `trackKey`: the voice, the voice with each section, and the voice with `UNSECTIONED`.
 * @param voices The voices of the song. The function reads `id` and `name`.
 * @param sections The sections of the song. The function reads `id` and `name`.
 */
export function defaultTrackNames(
  voices: readonly { id: string; name: string }[],
  sections: readonly { id: string; name: string }[],
): Map<string, string> {
  const names = new Map<string, string>()
  for (const voice of voices) {
    names.set(trackKey(voice.id, null), defaultTrackName(voice.name, null))
    for (const section of [...sections, { id: UNSECTIONED, name: UNSECTIONED }]) {
      names.set(trackKey(voice.id, section.id), defaultTrackName(voice.name, section.name))
    }
  }
  return names
}

// `RemoveUnsafeXmlChars` of xLights 2026.21 (src-core/utils/UtilFunctions.cpp:315-328) compares each byte as a
// signed `char`, so it removes each byte of UTF-8 above 127. Each code point above 127 has only such bytes.
const REMOVED_ON_IMPORT = /[^\x20-\x7f]|[=<>&"']/g

/**
 * Returns the timing track name that xLights shows after the import of the name.
 * xLights 2026.21 removes `= < > & " '`, each control character and each character that is not ASCII.
 * It does not trim spaces.
 * @param name The timing track name in the file.
 */
export function nameAfterImport(name: string): string {
  return name.replace(REMOVED_ON_IMPORT, '')
}

/**
 * Returns the hint under a name field: `xLights shows this name as “<name after>”.`
 * Returns null when xLights shows the name unchanged.
 * @param name The name that the person typed.
 */
export function importNameHint(name: string): string | null {
  const after = nameAfterImport(name)
  return after === name ? null : `xLights shows this name as “${after}”.`
}

// Windows refuses these characters in a file name, and `/` separates folders on every system.
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|]/g

/**
 * Returns a file name with each of `\ / : * ? " < > |` replaced with `_`.
 * @param name The file name, from text that the person supplies.
 */
export function safeFileName(name: string): string {
  return name.replace(UNSAFE_FILE_CHARACTERS, '_')
}

/**
 * Returns the name of the file that holds all timing tracks: `<song name>.xtiming`.
 * The function replaces each of `\ / : * ? " < > |` with `_`.
 * @param songName The name of the song.
 */
export function songFileName(songName: string): string {
  return safeFileName(`${songName}.xtiming`)
}

/**
 * Returns the name of the file for one timing track: `<song name> - <timing track name>.xtiming`.
 * The function replaces each of `\ / : * ? " < > |` with `_`.
 * @param songName The name of the song.
 * @param trackName The name of the timing track.
 */
export function trackFileName(songName: string, trackName: string): string {
  return safeFileName(`${songName} - ${trackName}.xtiming`)
}
