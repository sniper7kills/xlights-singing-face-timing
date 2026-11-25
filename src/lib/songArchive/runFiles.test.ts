import { describe, expect, it } from 'vitest'
import { makeReport, makeTrack } from '../runReport/report.test-helpers.ts'
import { reportToText } from '../runReport/reportText.ts'
import { runArchiveFiles, trackWavBytes } from './runFiles.ts'

const report = makeReport()

describe('runArchiveFiles', () => {
  it('gives no file for a song with no run data', () => {
    expect(runArchiveFiles(undefined)).toEqual([])
  })

  it('gives the two tracks as WAV files in tracks/ and then report.txt', () => {
    const tracks = { vocals: makeTrack(4, 5000), instruments: makeTrack(6, 5000) }

    const files = runArchiveFiles({ songId: 'song-1', tracks, singerSegments: [], report })

    expect(files.map((file) => [file.folder, file.fileName])).toEqual([
      ['tracks', 'vocals.wav'],
      ['tracks', 'instruments.wav'],
      [null, 'report.txt'],
    ])
    expect(files[0]?.data).toHaveLength(44 + 8)
    expect(new TextDecoder().decode(files[0]?.data.subarray(0, 4))).toBe('RIFF')
    expect(files[1]?.data).toHaveLength(44 + 12)
    expect(files[0]?.description).toBe(
      'The vocals of the last vocal separation, as 16-bit PCM at 22050 Hz. The first sample is at 5000 ms of the song.',
    )
    expect(new TextDecoder().decode(files[2]?.data)).toBe(reportToText(report))
  })

  it('gives report.txt only for a run with no kept tracks', () => {
    const files = runArchiveFiles({ songId: 'song-1', singerSegments: [], report })

    expect(files.map((file) => file.fileName)).toEqual(['report.txt'])
  })

  it('takes the WAV bytes from the given function, so the size note converts no audio', () => {
    const tracks = { vocals: makeTrack(4), instruments: makeTrack(6) }

    const files = runArchiveFiles(
      { songId: 'song-1', tracks, singerSegments: [], report },
      () => new Uint8Array(0),
    )

    expect(files[0]?.data).toHaveLength(0)
    expect(trackWavBytes(tracks.vocals) + trackWavBytes(tracks.instruments)).toBe(44 * 2 + 20)
  })
})
