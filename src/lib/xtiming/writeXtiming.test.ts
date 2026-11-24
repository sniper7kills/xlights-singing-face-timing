import { describe, expect, it } from 'vitest'
// Vite reads these files as UTF-8 text with no change, so the strings hold the exact bytes.
import noPhonemesGolden from '../../../tests/fixtures/xtiming/no-phonemes.xtiming?raw'
import oneTrackGolden from '../../../tests/fixtures/xtiming/one-track.xtiming?raw'
import specialLabelsGolden from '../../../tests/fixtures/xtiming/special-labels.xtiming?raw'
import twoTracksGolden from '../../../tests/fixtures/xtiming/two-tracks.xtiming?raw'
import type { ExportMark, ExportTrack } from './types.ts'
import { writeXtiming } from './writeXtiming.ts'

const VERSION = '2024.01'

function mark(label: string, startMs: number, endMs: number): ExportMark {
  return { label, startMs, endMs }
}

const leadVocals: ExportTrack = {
  name: 'Lead Vocals',
  layers: [
    [mark('Jingle bells', 12350, 13900)],
    [mark('Jingle', 12350, 13000), mark('bells', 13000, 13900)],
    [mark('etc', 12350, 12450), mark('AI', 12450, 12700)],
  ],
}

const harmony: ExportTrack = {
  name: 'Harmony',
  layers: [
    [mark('Oh what fun', 14000, 15500)],
    [mark('Oh', 14000, 14500), mark('what', 14500, 15000), mark('fun', 15000, 15500)],
    [
      mark('O', 14000, 14500),
      mark('WQ', 14500, 14750),
      mark('etc', 14750, 15000),
      mark('FV', 15000, 15250),
      mark('U', 15250, 15500),
    ],
  ],
}

const tomAndJerry = `Tom & "Jerry's" <3`

const specialLabels: ExportTrack = {
  name: tomAndJerry,
  layers: [
    [mark(`${tomAndJerry} > café`, 1000, 3000)],
    [
      mark('Tom', 1000, 1500),
      mark('&', 1500, 1750),
      mark(`"Jerry's"`, 1750, 2250),
      mark('<3', 2250, 2500),
      mark('>', 2500, 2750),
      mark('café', 2750, 3000),
    ],
    [],
  ],
}

const noPhonemes: ExportTrack = {
  name: 'Lead Vocals',
  layers: [leadVocals.layers[0], leadVocals.layers[1], []],
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function parse(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

describe('writeXtiming', () => {
  it('equals the one-track golden file byte for byte', () => {
    expect(bytes(writeXtiming([leadVocals], VERSION))).toEqual(bytes(oneTrackGolden))
  })

  it('equals the two-tracks golden file byte for byte', () => {
    expect(bytes(writeXtiming([leadVocals, harmony], VERSION))).toEqual(bytes(twoTracksGolden))
  })

  it('equals the special-labels golden file byte for byte', () => {
    expect(bytes(writeXtiming([specialLabels], VERSION))).toEqual(bytes(specialLabelsGolden))
  })

  it('equals the no-phonemes golden file byte for byte', () => {
    expect(bytes(writeXtiming([noPhonemes], VERSION))).toEqual(bytes(noPhonemesGolden))
  })

  it('writes three EffectLayer elements for a voice with no phonemes', () => {
    const timing = parse(writeXtiming([noPhonemes], VERSION)).documentElement
    const layers = [...timing.children].filter((child) => child.tagName === 'EffectLayer')
    expect(layers).toHaveLength(3)
    expect(layers[2]?.children).toHaveLength(0)
  })

  it('writes three EffectLayer elements for each timing track of a two-track file', () => {
    const timings = parse(writeXtiming([leadVocals, harmony], VERSION)).documentElement
    for (const timing of timings.children) {
      expect(timing.querySelectorAll(':scope > EffectLayer')).toHaveLength(3)
    }
  })

  it('gives back the label Tom & "Jerry\'s" <3 after an XML parser reads the file', () => {
    const track: ExportTrack = { name: tomAndJerry, layers: [[mark(tomAndJerry, 0, 50)], [], []] }
    const doc = parse(writeXtiming([track], VERSION))
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.getAttribute('name')).toBe(tomAndJerry)
    expect(doc.querySelector('Effect')?.getAttribute('label')).toBe(tomAndJerry)
  })

  it('keeps the UTF-8 bytes of non-ASCII text unchanged', () => {
    const track: ExportTrack = { name: 'café', layers: [[mark('café', 0, 50)], [], []] }
    const out = bytes(writeXtiming([track], VERSION))
    const cafe = [0x63, 0x61, 0x66, 0xc3, 0xa9]
    const count = out.reduce((n, _, i) => (cafe.every((b, j) => out[i + j] === b) ? n + 1 : n), 0)
    expect(count).toBe(2)
  })

  it('writes the root <timing> for one timing track', () => {
    expect(parse(writeXtiming([leadVocals], VERSION)).documentElement.tagName).toBe('timing')
  })

  it('writes the root <timings> for two timing tracks', () => {
    const root = parse(writeXtiming([leadVocals, harmony], VERSION)).documentElement
    expect(root.tagName).toBe('timings')
    expect(root.children).toHaveLength(2)
  })

  it('writes the marks of a layer in order of start time', () => {
    const reversed: ExportTrack = {
      name: leadVocals.name,
      layers: [
        [...leadVocals.layers[0]].reverse(),
        [...leadVocals.layers[1]].reverse(),
        [...leadVocals.layers[2]].reverse(),
      ],
    }
    expect(writeXtiming([reversed], VERSION)).toBe(oneTrackGolden)
  })

  it('keeps the order of the marks in the array of the caller', () => {
    const layer = [mark('b', 100, 200), mark('a', 0, 100)]
    writeXtiming([{ name: 'x', layers: [layer, [], []] }], VERSION)
    expect(layer.map((m) => m.label)).toEqual(['b', 'a'])
  })

  it('gives the same bytes for a mark with extra fields', () => {
    const withExtras = (m: ExportMark) => ({ ...m, markId: 'm1', unknown: true, estimated: true })
    const track: ExportTrack = {
      name: leadVocals.name,
      layers: [
        leadVocals.layers[0].map(withExtras),
        leadVocals.layers[1].map(withExtras),
        leadVocals.layers[2].map(withExtras),
      ],
    }
    expect(writeXtiming([track], VERSION)).toBe(oneTrackGolden)
  })

  it('writes the given source version in the SourceVersion attribute', () => {
    const root = parse(writeXtiming([leadVocals], '2025.10')).documentElement
    expect(root.getAttribute('SourceVersion')).toBe('2025.10')
    expect(root.getAttribute('subType')).toBe('')
  })
})
