/**
 * One mark in the `.xtiming` output: an xLights `<Effect>` element in a layer.
 * Every time is a whole number of milliseconds from the start of the song.
 * `writeXtiming` reads only `label`, `startMs` and `endMs`. The checks read the other fields.
 */
export interface ExportMark {
  /** The text that xLights shows on the mark. */
  label: string
  /** The start time in whole milliseconds. */
  startMs: number
  /** The end time in whole milliseconds. */
  endMs: number
  /** The id of the stored mark. A `rest` phoneme that the export adds has no id. */
  markId?: string
  /** True for a word that no dictionary has. `buildTracks` sets it on words only. */
  unknown?: boolean
  /** True for a word whose times the app estimated. `buildTracks` sets it on words only. */
  estimated?: boolean
}

/**
 * One timing track in the `.xtiming` output: an xLights `<timing>` element.
 * The xLights Faces effect reads the third layer, so every timing track has three layers.
 */
export interface ExportTrack {
  /** The timing track name that xLights shows after the import. */
  name: string
  /** The marks of the three layers, in this order: phrases, words, phonemes. */
  layers: [ExportMark[], ExportMark[], ExportMark[]]
  /** The key of the name in `ExportOptions.trackNames`: `voiceId` or `voiceId:sectionId`. */
  key?: string
  /** The id of the voice that gives the marks. */
  voiceId?: string
}

/** The choices of the person in the export dialog. */
export interface ExportOptions {
  /** The ids of the voices to export. `buildTracks` writes them in the order of `Voice.order`. */
  voiceIds: string[]
  /** `voice` gives one timing track for each voice. `voice-section` gives one for each voice and section. */
  grouping: 'voice' | 'voice-section'
  /** `one-file` writes all timing tracks into one file. `file-per-track` writes one file for each timing track. */
  packaging: 'one-file' | 'file-per-track'
  /** True to write a `rest` phoneme in each gap of the phoneme layer. */
  writeRest: boolean
  /** The names that the person edits. The key is `voiceId` or `voiceId:sectionId`. */
  trackNames: Record<string, string>
}
