import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { saveRunData } from './db.ts'
import type { RunData } from './types.ts'
import { useRunData } from './useRunData.ts'

function runData(songId: string, wordCount: number): RunData {
  return {
    songId,
    singerSegments: [],
    report: {
      startedAt: '2026-11-24T10:00:00.000Z',
      source: 'browser',
      endpointHost: null,
      mode: 'model',
      speechModel: 'whisper-base',
      device: 'wasm',
      separationModel: 'none',
      separationFallback: false,
      singers: {
        status: 'option-off',
        failureKind: null,
        diagnostics: null,
        rangeCount: null,
        singersWithPhrases: null,
        phrasesWithNoSinger: null,
        phrasesWithMoreSingers: null,
        voicesMade: null,
      },
      voices: [],
      phraseCount: 1,
      wordCount,
      estimatedCount: 0,
      unknownCount: 0,
      range: { startMs: 0, endMs: 1000 },
      frameMs: 50,
      durationsMs: {},
      notes: [],
    },
  }
}

describe('useRunData', () => {
  it('gives undefined for no song', () => {
    const { result } = renderHook(() => useRunData(null))
    expect(result.current).toBeUndefined()
  })

  it('gives null during the first read and undefined for a song with no run', async () => {
    const { result } = renderHook(() => useRunData('song-1'))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBeUndefined())
  })

  it('reads the run data again after a new run of the song', async () => {
    await saveRunData(runData('song-1', 3))
    const { result } = renderHook(() => useRunData('song-1'))
    await waitFor(() => expect(result.current?.report.wordCount).toBe(3))

    await saveRunData(runData('song-1', 9))

    await waitFor(() => expect(result.current?.report.wordCount).toBe(9))
  })

  it('does not read again after a run of another song', async () => {
    await saveRunData(runData('song-1', 3))
    const { result } = renderHook(() => useRunData('song-1'))
    await waitFor(() => expect(result.current?.report.wordCount).toBe(3))

    await saveRunData(runData('song-2', 9))

    expect(result.current?.report.wordCount).toBe(3)
  })
})
