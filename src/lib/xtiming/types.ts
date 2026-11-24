/**
 * One mark in the `.xtiming` output: an xLights `<Effect>` element in a layer.
 * Every time is a whole number of milliseconds from the start of the song.
 */
export interface ExportMark {
  /** The text that xLights shows on the mark. */
  label: string
  /** The start time in whole milliseconds. */
  startMs: number
  /** The end time in whole milliseconds. */
  endMs: number
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
}
