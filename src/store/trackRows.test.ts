import { describe, expect, it } from 'vitest'
import type { RunReport, SingerSection } from '../lib/runReport/runReport.ts'
import { lastRunSingerVoices, trackRows } from './trackRows.ts'
import type { KeptTracks, Mark, RunData, Voice } from './types.ts'

const TRACKS: KeptTracks = {
  vocals: { startMs: 0, sampleRate: 22_050, samples: new Int16Array(10) },
  instruments: { startMs: 0, sampleRate: 22_050, samples: new Int16Array(10) },
}

const VOICES: Voice[] = [
  { id: 'v1', songId: 's', name: 'Lead Vocals', order: 0, color: '#e05d5d' },
  { id: 'v2', songId: 's', name: 'Singer 2', order: 1, color: '#4dd0ff' },
]

function phrase(id: string, voiceId: string, startMs: number, endMs: number): Mark {
  return { id, voiceId, layer: 'phrase', label: id, startMs, endMs, parentId: null, edited: false }
}

const MARKS: Mark[] = [
  phrase('p1', 'v1', 0, 2000),
  phrase('p2', 'v2', 3000, 5000),
  { ...phrase('w1', 'v2', 0, 2000), layer: 'word', parentId: 'p2' },
  phrase('outside', 'v2', 9000, 9500),
]

function data(status: SingerSection['status']): RunData {
  const report = {
    singers: { status } as SingerSection,
    voices: [
      { name: 'Lead Vocals', phraseCount: 1 },
      { name: 'Singer 2', phraseCount: 1, made: true },
      { name: 'Deleted voice', phraseCount: 1, made: true },
    ],
    range: { startMs: 0, endMs: 8000 },
  } as RunReport
  return {
    songId: 's',
    tracks: TRACKS,
    singerSegments: [
      { startMs: 100, endMs: 1900, singer: 4 },
      { startMs: 3100, endMs: 4900, singer: 2 },
    ],
    report,
  }
}

describe('trackRows', () => {
  it('gives no row with no run data or no kept tracks', () => {
    expect(trackRows(null, VOICES, MARKS)).toEqual([])
    expect(trackRows(undefined, VOICES, MARKS)).toEqual([])
    expect(trackRows({ ...data('split'), tracks: undefined }, VOICES, MARKS)).toEqual([])
  })

  it('gives "Vocals" and "Instruments" for a run with no singer voices', () => {
    expect(trackRows(data('one-singer'), VOICES, MARKS).map((row) => row.name)).toEqual([
      'Vocals',
      'Instruments',
    ])
  })

  it('gives one vocals row for each singer voice, in the colour of the voice and limited to its ranges', () => {
    const rows = trackRows(data('split'), VOICES, MARKS)
    expect(rows.slice(2)).toEqual([
      {
        id: 'singer:v1',
        name: 'Lead Vocals',
        track: 'vocals',
        gate: [{ startMs: 100, endMs: 1900 }],
        color: '#e05d5d',
      },
      {
        id: 'singer:v2',
        name: 'Singer 2',
        track: 'vocals',
        gate: [{ startMs: 3100, endMs: 4900 }],
        color: '#4dd0ff',
      },
    ])
  })

  it('gives singer rows after a capped singer step too', () => {
    expect(trackRows(data('capped'), VOICES, MARKS)).toHaveLength(4)
  })

  it('gives the rows of two singers from a count of 2, with singer numbers from 0 and overlapping ranges', () => {
    // The clustering with a count numbers the singers from 0, and a short second part can sing over the first.
    const counted: RunData = {
      ...data('split'),
      singerSegments: [
        { startMs: 0, endMs: 1300, singer: 0 },
        { startMs: 1700, endMs: 3300, singer: 0 },
        { startMs: 3500, endMs: 4100, singer: 0 },
        { startMs: 4700, endMs: 5000, singer: 0 },
        { startMs: 1200, endMs: 1800, singer: 1 },
        { startMs: 3200, endMs: 3600, singer: 1 },
        { startMs: 4000, endMs: 4800, singer: 1 },
      ],
    }
    const marks = [
      phrase('p1', 'v1', 0, 1200),
      phrase('p2', 'v1', 1800, 3200),
      phrase('p3', 'v2', 1200, 1800),
      phrase('p4', 'v2', 3200, 4900),
    ]

    expect(trackRows(counted, VOICES, marks).slice(2)).toEqual([
      expect.objectContaining({
        id: 'singer:v1',
        gate: [
          { startMs: 0, endMs: 1300 },
          { startMs: 1700, endMs: 3300 },
          { startMs: 3500, endMs: 4100 },
          { startMs: 4700, endMs: 5000 },
        ],
      }),
      expect.objectContaining({
        id: 'singer:v2',
        gate: [
          { startMs: 1200, endMs: 1800 },
          { startMs: 3200, endMs: 3600 },
          { startMs: 4000, endMs: 4800 },
        ],
      }),
    ])
  })

  it('gives no row to a voice with no singer range', () => {
    const rows = trackRows(data('split'), VOICES, [phrase('p1', 'v1', 0, 2000)])
    expect(rows.map((row) => row.id)).toEqual(['vocals', 'instruments', 'singer:v1'])
  })
})

/** A record with voice ids: the singers of each voice are fixed at the end of the run. */
function dataWithIds(status: SingerSection['status'] = 'split'): RunData {
  return {
    ...data(status),
    voices: [
      { voiceId: 'v1', singers: [4], made: false },
      { voiceId: 'v2', singers: [2], made: true },
    ],
  }
}

describe('trackRows with the voice ids of the run', () => {
  it('keeps the row and the ranges of a renamed voice, under the new name', () => {
    const renamed = VOICES.map((voice) =>
      voice.id === 'v2' ? { ...voice, name: 'Test Alto' } : voice,
    )

    const rows = trackRows(dataWithIds(), renamed, MARKS).slice(2)

    expect(rows).toEqual([
      expect.objectContaining({ id: 'singer:v1', gate: [{ startMs: 100, endMs: 1900 }] }),
      {
        id: 'singer:v2',
        name: 'Test Alto',
        track: 'vocals',
        gate: [{ startMs: 3100, endMs: 4900 }],
        color: '#4dd0ff',
      },
    ])
  })

  it('gives no row and no range to a deleted voice, and the row of the other voice does not change', () => {
    const rows = trackRows(dataWithIds(), [VOICES[0] as Voice], MARKS).slice(2)

    expect(rows).toEqual([
      expect.objectContaining({ id: 'singer:v1', gate: [{ startMs: 100, endMs: 1900 }] }),
    ])
  })

  it('reads the singers from the record, not from the phrases', () => {
    // The phrases of v2 now lie in the ranges of singer 4, but the record keeps singer 2 on v2.
    const moved = [phrase('p1', 'v2', 0, 2000), phrase('p2', 'v2', 3000, 5000)]

    const rows = trackRows(dataWithIds(), VOICES, moved).slice(2)

    expect(rows.map((row) => [row.id, row.gate])).toEqual([
      ['singer:v1', [{ startMs: 100, endMs: 1900 }]],
      ['singer:v2', [{ startMs: 3100, endMs: 4900 }]],
    ])
  })

  it('shows the rows in the present voice order', () => {
    const reordered = [VOICES[1] as Voice, VOICES[0] as Voice]

    expect(
      trackRows(dataWithIds(), reordered, MARKS)
        .slice(2)
        .map((row) => row.id),
    ).toEqual(['singer:v2', 'singer:v1'])
  })

  it('gives no row to a voice of the run with no singer, or to a voice that is not in the record', () => {
    const extra: Voice = { id: 'v3', songId: 's', name: 'Other', order: 2, color: '#fff' }
    const record = {
      ...dataWithIds(),
      voices: [{ voiceId: 'v1', singers: [], made: false }],
    }

    expect(trackRows(record, [...VOICES, extra], MARKS)).toHaveLength(2)
  })

  it('gives no singer row when the singer step did not split', () => {
    expect(trackRows(dataWithIds('failed'), VOICES, MARKS)).toHaveLength(2)
  })
})

describe('lastRunSingerVoices', () => {
  it('gives the voices that the singer step of the last run added, by id, also after a rename', () => {
    const renamed = VOICES.map((voice) =>
      voice.id === 'v2' ? { ...voice, name: 'Test Alto' } : voice,
    )

    expect(lastRunSingerVoices(dataWithIds(), renamed, 'v1').map((voice) => voice.id)).toEqual([
      'v2',
    ])
  })

  it('leaves out the voice of the new run and a deleted voice', () => {
    expect(lastRunSingerVoices(dataWithIds(), VOICES, 'v2')).toEqual([])
    expect(lastRunSingerVoices(dataWithIds(), [VOICES[0] as Voice], 'v1')).toEqual([])
  })

  it('gives no voice for a song with no run data', () => {
    expect(lastRunSingerVoices(undefined, VOICES, 'v1')).toEqual([])
  })

  it('finds the voices by the names in the report for a record with no voice ids', () => {
    expect(lastRunSingerVoices(data('split'), VOICES, 'v1').map((voice) => voice.id)).toEqual([
      'v2',
    ])
  })
})
