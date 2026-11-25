import { describe, expect, it } from 'vitest'
// xLights 2026.21 wrote this file with "Export Timing Track" after it imported three app exports of the demo song.
import xlightsExport from '../../../tests/fixtures/xtiming/xlights-2026.21-export.xtiming?raw'
import twoTracksGolden from '../../../tests/fixtures/xtiming/two-tracks.xtiming?raw'
import type { ExportMark, ExportTrack } from './types.ts'
import { writeXtiming } from './writeXtiming.ts'

/** Reads the timing tracks of an `.xtiming` text with the XML parser of the browser. */
function readTracks(text: string): ExportTrack[] {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  return [...document.getElementsByTagName('timing')].map((timing) => {
    const layers = [...timing.getElementsByTagName('EffectLayer')].map((layer) =>
      [...layer.getElementsByTagName('Effect')].map((effect): ExportMark => ({
        label: effect.getAttribute('label') ?? '',
        startMs: Number(effect.getAttribute('starttime')),
        endMs: Number(effect.getAttribute('endtime')),
      })),
    )
    expect(layers).toHaveLength(3)
    const [phrases = [], words = [], phonemes = []] = layers
    return { name: timing.getAttribute('name') ?? '', key: '', layers: [phrases, words, phonemes] }
  })
}

/** Returns each line with every attribute value replaced, so that two files compare by structure only. */
function lineShapes(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/="[^"]*"/g, '=""'))
}

describe('the structure of a file that xLights 2026.21 wrote', () => {
  it('has three timing tracks with three layers each and the attributes in the order of the app', () => {
    const tracks = readTracks(xlightsExport)

    expect(tracks.map((track) => track.name)).toEqual(['Lead', 'Chorus', 'Lead  Co caf'])
    expect(xlightsExport.match(/<timing [^>]*>/g)).toEqual([
      '<timing name="Lead" subType="" SourceVersion="2026.21">',
      '<timing name="Chorus" subType="" SourceVersion="2026.21">',
      '<timing name="Lead  Co caf" subType="" SourceVersion="2026.21">',
    ])
  })

  it('keeps the labels with & < > " \' and non-ASCII text that the app wrote', () => {
    const labels = readTracks(xlightsExport)[2]
      ?.layers.flat()
      .map((mark) => mark.label)

    expect(labels).toContain(`Tom & "Jerry's" <3 > café`)
    expect(labels).toEqual(expect.arrayContaining(['&', '<night>', '"holy"', "night's"]))
  })

  it('equals byte for byte the output of writeXtiming for the same timing tracks', () => {
    expect(writeXtiming(readTracks(xlightsExport), '2026.21')).toBe(xlightsExport)
  })

  it('has the same line shapes as a golden file of the app', () => {
    const xlightsShapes = new Set(lineShapes(xlightsExport))

    for (const shape of lineShapes(twoTracksGolden)) expect(xlightsShapes).toContain(shape)
  })
})
