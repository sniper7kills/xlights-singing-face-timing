import { escapeXml } from './escapeXml.ts'
import type { ExportTrack } from './types.ts'

/**
 * Returns the text of an `.xtiming` file in the shape that xLights exports.
 *
 * The text has `\n` line ends, also after the last line. Encode it as UTF-8.
 * One timing track gives the root `<timing>`. More than one gives the root `<timings>`.
 * Each timing track has three `<EffectLayer>` elements, also when a layer is empty.
 * The marks of a layer are in order of start time.
 *
 * @param tracks The timing tracks. Every time is a whole number of milliseconds:
 *   `buildTracks` gives this guarantee, so this function does not round.
 * @param sourceVersion The value of the `SourceVersion` attribute, for example `2024.01`.
 *   xLights does not read it on import. It is a fixed value, so it is not escaped.
 */
export function writeXtiming(tracks: ExportTrack[], sourceVersion: string): string {
  const wrap = tracks.length > 1
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  if (wrap) lines.push('<timings>')
  for (const track of tracks) {
    lines.push(
      `<timing name="${escapeXml(track.name)}" subType="" SourceVersion="${sourceVersion}">`,
    )
    for (const layer of track.layers) {
      lines.push('   <EffectLayer>')
      // A sorted copy keeps the array of the caller unchanged.
      for (const mark of [...layer].sort((a, b) => a.startMs - b.startMs)) {
        lines.push(
          `      <Effect label="${escapeXml(mark.label)}" starttime="${mark.startMs}" endtime="${mark.endMs}" />`,
        )
      }
      lines.push('   </EffectLayer>')
    }
    lines.push('</timing>')
  }
  if (wrap) lines.push('</timings>')
  return lines.join('\n') + '\n'
}
