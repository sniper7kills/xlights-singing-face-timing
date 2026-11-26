import { describe, expect, it } from 'vitest'
import type { PcmTrack } from '../lib/audio/pcm.ts'
import { makeReport } from '../lib/runReport/report.test-helpers.ts'
import { trackKeys, trackOf, trackRows } from './trackRows.ts'
import type { KeptTracks, RunData, Voice } from './types.ts'

function pcm(startMs: number): PcmTrack {
  return { startMs, sampleRate: 22_050, samples: new Int16Array(4) }
}

const TRACKS: KeptTracks = {
  vocals: pcm(0),
  instruments: pcm(0),
  split: [pcm(1), pcm(2)],
}

const VOICES: Voice[] = [
  { id: 'lead', songId: 's', name: 'Lead Vocals', order: 0, color: '#ffb238' },
  { id: 'm', songId: 's', name: 'Male', order: 1, color: '#7ae582' },
  { id: 'f', songId: 's', name: 'Female', order: 2, color: '#4cc9f0' },
]

const DATA: RunData = {
  songId: 's',
  tracks: TRACKS,
  voices: [
    { voiceId: 'lead', singers: [], made: false },
    { voiceId: 'f', singers: [], made: true, splitTrack: 0 },
    { voiceId: 'm', singers: [], made: true, splitTrack: 1 },
  ],
  singerSegments: [],
  report: makeReport(),
}

describe('track rows of a singer split', () => {
  it('gives one row for each voice of the split, in the present voice order, with all of its track', () => {
    const rows = trackRows(DATA, VOICES, [])

    expect(rows.map((row) => [row.id, row.name, row.track, row.gate, row.color])).toEqual([
      ['vocals', 'Vocals', 'vocals', null, null],
      ['instruments', 'Instruments', 'instruments', null, null],
      ['split:m', 'Male', 'split:1', null, '#7ae582'],
      ['split:f', 'Female', 'split:0', null, '#4cc9f0'],
    ])
  })

  it('gives no split row for a deleted voice or a missing track', () => {
    const data: RunData = { ...DATA, tracks: { ...TRACKS, split: [pcm(1)] } }

    const rows = trackRows(data, VOICES.slice(0, 2), [])

    expect(rows.map((row) => row.id)).toEqual(['vocals', 'instruments'])
  })

  it('lists the key of each kept track and finds the track of a key', () => {
    expect(trackKeys(TRACKS)).toEqual(['vocals', 'instruments', 'split:0', 'split:1'])
    expect(trackOf(TRACKS, 'split:1')).toBe(TRACKS.split?.[1])
    expect(trackOf(TRACKS, 'vocals')).toBe(TRACKS.vocals)
    expect(trackOf({ vocals: pcm(0), instruments: pcm(0) }, 'split:0')).toBeUndefined()
  })
})
