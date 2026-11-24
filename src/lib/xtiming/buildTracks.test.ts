import { describe, expect, it } from 'vitest'
import type { FrameMs, Layer, Section, Song, Voice } from '../../store/types.ts'
import { buildTracks, type SourceMark } from './buildTracks.ts'
import type { ExportMark, ExportOptions } from './types.ts'
import { writeXtiming } from './writeXtiming.ts'

function makeSong(frameMs: FrameMs = 50): Song {
  return {
    id: 'song-1',
    name: 'Carol',
    durationMs: 60000,
    frameMs,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  }
}

function makeVoice(id: string, name: string, order: number): Voice {
  return { id, songId: 'song-1', name, order, color: '#e05d5d' }
}

function makeSection(id: string, name: string, startMs: number, endMs: number): Section {
  return { id, songId: 'song-1', name, startMs, endMs }
}

function makeMark(
  id: string,
  voiceId: string,
  layer: Layer,
  label: string,
  startMs: number,
  endMs: number,
  parentId: string | null = null,
): SourceMark {
  return { id, voiceId, layer, label, startMs, endMs, parentId, edited: false }
}

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    voiceIds: ['lead', 'harmony'],
    grouping: 'voice',
    packaging: 'one-file',
    writeRest: false,
    trackNames: {},
    ...overrides,
  }
}

// The voices are out of order in the array, so the tests also show the sort by Voice.order.
const voices = [makeVoice('harmony', 'Harmony', 1), makeVoice('lead', 'Lead Vocals', 0)]

const sections = [
  makeSection('chorus', 'Chorus', 10000, 20000),
  makeSection('verse', 'Verse', 0, 10000),
  makeSection('bridge', 'Bridge', 20000, 30000),
]

/** One phrase with one word and two phonemes, in each of the three sections, for each voice. */
function marksInEverySection(): SourceMark[] {
  const marks: SourceMark[] = []
  for (const voiceId of ['lead', 'harmony']) {
    for (const base of [1000, 11000, 21000]) {
      const p = `${voiceId}-p${base}`
      const w = `${voiceId}-w${base}`
      marks.push(
        makeMark(p, voiceId, 'phrase', 'Jingle bells', base, base + 2000),
        makeMark(w, voiceId, 'word', 'Jingle', base, base + 1000, p),
        makeMark(`${w}-1`, voiceId, 'phoneme', 'etc', base, base + 300, w),
        makeMark(`${w}-2`, voiceId, 'phoneme', 'AI', base + 300, base + 1000, w),
      )
    }
  }
  return marks
}

function allMarks(tracks: ReturnType<typeof buildTracks>): ExportMark[] {
  return tracks.flatMap((track) => track.layers.flat())
}

/** Fails the test when `buildTracks` returns no timing track where the test expects one. */
function noTrack(): never {
  throw new Error('buildTracks returned no timing track')
}

describe('buildTracks, grouping by voice', () => {
  it('gives 2 timing tracks for 2 voices, named after the voices in voice order', () => {
    const tracks = buildTracks(makeSong(), voices, sections, marksInEverySection(), options())
    expect(tracks.map((track) => track.name)).toEqual(['Lead Vocals', 'Harmony'])
    expect(tracks.map((track) => track.key)).toEqual(['lead', 'harmony'])
    expect(tracks.map((track) => track.voiceId)).toEqual(['lead', 'harmony'])
  })

  it('writes only the voices in voiceIds', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({ voiceIds: ['harmony'] }),
    )
    expect(tracks.map((track) => track.name)).toEqual(['Harmony'])
  })

  it('gives a selected voice with no marks a timing track with three empty layers', () => {
    const tracks = buildTracks(makeSong(), voices, [], [], options({ voiceIds: ['lead'] }))
    expect(tracks).toEqual([
      { name: 'Lead Vocals', layers: [[], [], []], key: 'lead', voiceId: 'lead' },
    ])
  })

  it('uses the edited timing track name', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({ trackNames: { lead: 'Santa Face' } }),
    )
    expect(tracks.map((track) => track.name)).toEqual(['Santa Face', 'Harmony'])
  })

  it('puts the phrases, the words and the phonemes of the voice into the three layers', () => {
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marksInEverySection(),
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers.map((layer) => layer.length)).toEqual([3, 3, 6])
    expect(lead.layers[2].map((mark) => mark.label)).toEqual([
      'etc',
      'AI',
      'etc',
      'AI',
      'etc',
      'AI',
    ])
  })

  it('puts each layer in order of start time', () => {
    const marks = [
      makeMark('p2', 'lead', 'phrase', 'second', 5000, 6000),
      makeMark('p1', 'lead', 'phrase', 'first', 1000, 2000),
    ]
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[0].map((mark) => mark.label)).toEqual(['first', 'second'])
  })
})

describe('buildTracks, grouping by voice and section', () => {
  it('gives 6 timing tracks for 2 voices and 3 sections, in voice order and section order', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({ grouping: 'voice-section' }),
    )
    expect(tracks.map((track) => track.name)).toEqual([
      'Lead Vocals - Verse',
      'Lead Vocals - Chorus',
      'Lead Vocals - Bridge',
      'Harmony - Verse',
      'Harmony - Chorus',
      'Harmony - Bridge',
    ])
    expect(tracks[1]?.key).toBe('lead:chorus')
    expect(tracks.every((track) => track.layers[0].length === 1)).toBe(true)
  })

  it('omits a timing track with no phrase', () => {
    const marks = marksInEverySection().filter((mark) => !mark.id.includes('11000'))
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marks,
      options({ grouping: 'voice-section' }),
    )
    expect(tracks).toHaveLength(4)
    expect(tracks.some((track) => track.name.endsWith('Chorus'))).toBe(false)
  })

  it('puts a phrase into the section that holds the middle of the phrase', () => {
    // The phrase starts in the verse, but its middle, 10500, is in the chorus.
    const marks = [makeMark('p', 'lead', 'phrase', 'across', 9000, 12000)]
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marks,
      options({ voiceIds: ['lead'], grouping: 'voice-section' }),
    )
    expect(tracks.map((track) => track.name)).toEqual(['Lead Vocals - Chorus'])
  })

  it('puts a phrase whose middle is on a section end into the next section', () => {
    const marks = [makeMark('p', 'lead', 'phrase', 'edge', 9000, 11000)]
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marks,
      options({ voiceIds: ['lead'], grouping: 'voice-section' }),
    )
    expect(tracks.map((track) => track.name)).toEqual(['Lead Vocals - Chorus'])
  })

  it('puts a phrase outside every section into the Unsectioned timing track, last', () => {
    const marks = [
      makeMark('p1', 'lead', 'phrase', 'outside', 40000, 41000),
      makeMark('p2', 'lead', 'phrase', 'inside', 1000, 2000),
    ]
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marks,
      options({ voiceIds: ['lead'], grouping: 'voice-section' }),
    )
    expect(tracks.map((track) => [track.name, track.key])).toEqual([
      ['Lead Vocals - Verse', 'lead:verse'],
      ['Lead Vocals - Unsectioned', 'lead:Unsectioned'],
    ])
  })

  it('gives only Unsectioned timing tracks for a song with no sections', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      [],
      marksInEverySection(),
      options({ grouping: 'voice-section' }),
    )
    expect(tracks.map((track) => track.name)).toEqual([
      'Lead Vocals - Unsectioned',
      'Harmony - Unsectioned',
    ])
  })

  it('uses the edited name with the key voiceId:sectionId', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({
        voiceIds: ['lead'],
        grouping: 'voice-section',
        trackNames: { 'lead:bridge': 'Finale' },
      }),
    )
    expect(tracks.map((track) => track.name)).toEqual([
      'Lead Vocals - Verse',
      'Lead Vocals - Chorus',
      'Finale',
    ])
  })

  it('keeps the words and phonemes with the timing track of their phrase and does not change times', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({ voiceIds: ['lead'], grouping: 'voice-section' }),
    )
    expect(tracks[1]?.layers).toEqual([
      [{ label: 'Jingle bells', startMs: 11000, endMs: 13000, markId: 'lead-p11000' }],
      [
        {
          label: 'Jingle',
          startMs: 11000,
          endMs: 12000,
          markId: 'lead-w11000',
          unknown: false,
          estimated: false,
        },
      ],
      [
        { label: 'etc', startMs: 11000, endMs: 11300, markId: 'lead-w11000-1' },
        { label: 'AI', startMs: 11300, endMs: 12000, markId: 'lead-w11000-2' },
      ],
    ])
  })
})

describe('buildTracks, times', () => {
  const rawMarks = [
    makeMark('p', 'lead', 'phrase', 'Jingle bells', 1012.4, 3987.6),
    makeMark('w1', 'lead', 'word', 'Jingle', 1012.4, 2013, 'p'),
    makeMark('w2', 'lead', 'word', 'bells', 2013, 3987.6, 'p'),
    makeMark('f1', 'lead', 'phoneme', 'etc', 1012.4, 1137, 'w1'),
    makeMark('f2', 'lead', 'phoneme', 'AI', 1137, 2013, 'w1'),
  ]

  for (const frameMs of [25, 50] as const) {
    it(`writes every time as a whole number and a multiple of ${frameMs} ms`, () => {
      const tracks = buildTracks(makeSong(frameMs), voices, [], rawMarks, options())
      const times = allMarks(tracks).flatMap((mark) => [mark.startMs, mark.endMs])
      expect(times.length).toBeGreaterThan(0)
      for (const ms of times) {
        expect(Number.isInteger(ms)).toBe(true)
        expect(ms % frameMs).toBe(0)
      }
    })
  }

  it('snaps each time to the nearest multiple of the frame size', () => {
    const [lead = noTrack()] = buildTracks(
      makeSong(50),
      voices,
      [],
      rawMarks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[0]).toMatchObject([{ startMs: 1000, endMs: 4000 }])
  })

  it('extends a mark that the snap makes zero length to one frame size', () => {
    const marks = [
      makeMark('p', 'lead', 'phrase', 'Oh', 1000, 2000),
      makeMark('w', 'lead', 'word', 'Oh', 1000, 2000, 'p'),
      makeMark('f', 'lead', 'phoneme', 'O', 1010, 1020, 'w'),
    ]
    const [lead = noTrack()] = buildTracks(
      makeSong(50),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[2]).toEqual([{ label: 'O', startMs: 1000, endMs: 1050, markId: 'f' }])
  })

  it('moves the next mark later when an extension overlaps it', () => {
    const marks = [
      makeMark('p', 'lead', 'phrase', 'Oh', 1000, 2000),
      makeMark('w', 'lead', 'word', 'Oh', 1000, 2000, 'p'),
      makeMark('f1', 'lead', 'phoneme', 'O', 1000, 1010, 'w'),
      makeMark('f2', 'lead', 'phoneme', 'U', 1010, 1020, 'w'),
      makeMark('f3', 'lead', 'phoneme', 'etc', 1020, 1200, 'w'),
    ]
    const [lead = noTrack()] = buildTracks(
      makeSong(50),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[2].map((mark) => [mark.startMs, mark.endMs])).toEqual([
      [1000, 1050],
      [1050, 1100],
      [1100, 1200],
    ])
  })

  it('does not change the input marks', () => {
    const marks = rawMarks.map((mark) => ({ ...mark }))
    const before = structuredClone(marks)
    buildTracks(makeSong(50), voices, sections, marks, options({ writeRest: true }))
    buildTracks(makeSong(50), voices, sections, marks, options({ grouping: 'voice-section' }))
    expect(marks).toEqual(before)
  })
})

describe('buildTracks, mark states', () => {
  it('carries the unknown and estimated states of a word', () => {
    const marks: SourceMark[] = [
      makeMark('p', 'lead', 'phrase', 'Zxqv', 1000, 2000),
      { ...makeMark('w', 'lead', 'word', 'Zxqv', 1000, 2000, 'p'), unknown: true, estimated: true },
    ]
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[1]).toMatchObject([{ markId: 'w', unknown: true, estimated: true }])
    expect(lead.layers[0]).toEqual([{ label: 'Zxqv', startMs: 1000, endMs: 2000, markId: 'p' }])
  })
})

describe('buildTracks, rest phonemes', () => {
  const marks = [
    makeMark('p1', 'lead', 'phrase', 'Jingle bells', 1000, 3000),
    makeMark('p2', 'lead', 'phrase', 'Jingle all', 5000, 7000),
    makeMark('w1', 'lead', 'word', 'Jingle', 1000, 2000, 'p1'),
    makeMark('w2', 'lead', 'word', 'Jingle', 5000, 6000, 'p2'),
    makeMark('f1', 'lead', 'phoneme', 'etc', 1200, 1500, 'w1'),
    makeMark('f2', 'lead', 'phoneme', 'AI', 1500, 2000, 'w1'),
    makeMark('f3', 'lead', 'phoneme', 'etc', 5000, 6000, 'w2'),
  ]

  it('writes no rest phoneme when the option is off', () => {
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'] }),
    )
    expect(lead.layers[2].some((mark) => mark.label === 'rest')).toBe(false)
  })

  it('leaves no gap in the phoneme layer between the first phrase start and the last phrase end', () => {
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marks,
      options({ voiceIds: ['lead'], writeRest: true }),
    )
    const phonemes = lead.layers[2]
    expect(phonemes.map((mark) => [mark.label, mark.startMs, mark.endMs])).toEqual([
      ['rest', 1000, 1200],
      ['etc', 1200, 1500],
      ['AI', 1500, 2000],
      ['rest', 2000, 5000],
      ['etc', 5000, 6000],
      ['rest', 6000, 7000],
    ])
    expect(phonemes[0]).not.toHaveProperty('markId')
    for (let i = 1; i < phonemes.length; i++) {
      expect(phonemes[i]?.startMs).toBe(phonemes[i - 1]?.endMs)
    }
  })

  it('fills the phoneme layer with one rest phoneme for a phrase with no phonemes', () => {
    const [lead = noTrack()] = buildTracks(
      makeSong(),
      voices,
      [],
      marks.slice(0, 1),
      options({ voiceIds: ['lead'], writeRest: true }),
    )
    expect(lead.layers[2]).toEqual([{ label: 'rest', startMs: 1000, endMs: 3000 }])
  })
})

describe('buildTracks with writeXtiming', () => {
  it('gives exactly three EffectLayer elements for each timing track', () => {
    const tracks = buildTracks(
      makeSong(),
      voices,
      sections,
      marksInEverySection(),
      options({ grouping: 'voice-section' }),
    )
    const xml = writeXtiming(tracks, '2024.01')
    const timings = xml.split('<timing name=').slice(1)
    expect(timings).toHaveLength(6)
    for (const timing of timings) {
      expect(timing.match(/<EffectLayer>/g)).toHaveLength(3)
    }
  })
})
