import { describe, expect, it } from 'vitest'
import type { RunReport, SingerSection } from '../lib/runReport/runReport.ts'
import { trackRows } from './trackRows.ts'
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
