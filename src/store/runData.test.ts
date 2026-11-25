import { describe, expect, it, vi } from 'vitest'
import type { RunReport } from '../lib/runReport/runReport.ts'
import {
  closeDatabase,
  deleteSong,
  isNewerDatabaseError,
  listSongs,
  loadRunData,
  onDatabaseBlocked,
  onRunDataSaved,
  openDatabase,
  saveRunData,
  saveSong,
  StorageFullError,
} from './db.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import type { KeptTracks, RunData } from './types.ts'

function report(change: Partial<RunReport> = {}): RunReport {
  return {
    startedAt: '2026-11-24T10:00:00.000Z',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
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
    voices: [{ name: 'Lead Vocals', phraseCount: 1 }],
    phraseCount: 1,
    wordCount: 2,
    estimatedCount: 0,
    unknownCount: 0,
    range: { startMs: 0, endMs: 4000 },
    frameMs: 50,
    durationsMs: { prepare: 10 },
    notes: [],
    ...change,
  }
}

function runData(songId: string, wordCount = 2): RunData {
  return {
    songId,
    singerSegments: [{ startMs: 0, endMs: 1000, singer: 0 }],
    report: report({ wordCount }),
  }
}

const VERSION_TWO_STORES: [string, string | null, string[]][] = [
  ['songs', 'id', []],
  ['audioFiles', 'songId', []],
  ['voices', 'id', ['songId']],
  ['sections', 'id', ['songId']],
  ['marks', 'id', ['voiceId']],
  ['customEntries', 'word', []],
  ['settings', null, []],
]

/** Opens the database at version 2, with the object stores of version 2 and one song, as the app before issue #129 does. */
function openVersionTwo(): Promise<void> {
  const content = makeSongContent('old-song')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('singing-face-timing', 2)
    request.onupgradeneeded = () => {
      for (const [name, keyPath, indexes] of VERSION_TWO_STORES) {
        const store = request.result.createObjectStore(
          name,
          keyPath === null ? undefined : { keyPath },
        )
        for (const index of indexes) store.createIndex(index, index)
      }
      request.transaction?.objectStore('songs').put(content.song)
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

describe('run data', () => {
  it('upgrades a version 2 database to version 3, keeps each song and adds the runs object store', async () => {
    await openVersionTwo()

    const database = await openDatabase()

    expect(database.version).toBe(3)
    expect(database.objectStoreNames.contains('runs')).toBe(true)
    expect((await listSongs()).map((song) => song.id)).toEqual(['old-song'])
    expect(await loadRunData('old-song')).toBeUndefined()
  })

  it('returns undefined for a song with no run', async () => {
    expect(await loadRunData('song-1')).toBeUndefined()
  })

  it('keeps the singer ranges and the report after the connection closes', async () => {
    await saveRunData(runData('song-1'))
    await closeDatabase()

    const loaded = await loadRunData('song-1')

    expect(loaded?.report).toEqual(report())
    expect(loaded?.singerSegments).toEqual([{ startMs: 0, endMs: 1000, singer: 0 }])
  })

  it('replaces the singer ranges and the report of the earlier run', async () => {
    await saveRunData(runData('song-1'))

    await saveRunData({ ...runData('song-1', 7), singerSegments: [] })

    const loaded = await loadRunData('song-1')
    expect(loaded?.report.wordCount).toBe(7)
    expect(loaded?.singerSegments).toEqual([])
  })

  it('tells each listener of the song id after a write, and stops after the listener leaves', async () => {
    const heard: string[] = []
    const stop = onRunDataSaved((songId) => heard.push(songId))

    await saveRunData(runData('song-1'))
    stop()
    await saveRunData(runData('song-2'))

    expect(heard).toEqual(['song-1'])
  })

  it('rejects with StorageFullError, tells no listener and keeps the earlier run data when the browser storage is full', async () => {
    await saveRunData(runData('song-1', 7))
    const heard: string[] = []
    const stop = onRunDataSaved((songId) => heard.push(songId))
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
    })

    await expect(saveRunData(runData('song-1', 8))).rejects.toBeInstanceOf(StorageFullError)

    vi.restoreAllMocks()
    stop()
    expect(heard).toEqual([])
    expect((await loadRunData('song-1'))?.report.wordCount).toBe(7)
  })

  it('deletes the run data with the song and keeps the run data of the other songs', async () => {
    await saveSong(makeSongContent('song-1'))
    await saveSong(makeSongContent('song-2'))
    await saveRunData(runData('song-1'))
    await saveRunData(runData('song-2'))

    await deleteSong('song-1')

    expect(await loadRunData('song-1')).toBeUndefined()
    expect(await loadRunData('song-2')).toBeDefined()
  })

  it('keeps the audio tracks after the connection closes, with the samples, the sample rate and the start', async () => {
    await saveRunData({ ...runData('song-1'), tracks: tracks(5000) })
    await closeDatabase()

    const loaded = await loadRunData('song-1')

    // The structured clone of fake-indexeddb makes typed arrays of another realm, so the test compares the values.
    expect(loaded?.tracks?.vocals).toMatchObject({ startMs: 5000, sampleRate: 22_050 })
    const kept = loaded?.tracks
    if (kept === undefined) throw new Error('The run data has no tracks.')
    expect(Array.from(kept.vocals.samples)).toEqual([1, -2, 3])
    expect(Array.from(kept.instruments.samples)).toEqual([-4, 5])
    expect(kept.vocals.samples.BYTES_PER_ELEMENT).toBe(2)
  })

  it('replaces the audio tracks of the earlier run, and removes them after a run with no tracks', async () => {
    await saveRunData({ ...runData('song-1'), tracks: tracks(5000) })

    await saveRunData({ ...runData('song-1'), tracks: tracks(0) })
    const replaced = await loadRunData('song-1')
    await saveRunData(runData('song-1'))

    expect(replaced?.tracks?.vocals.startMs).toBe(0)
    expect((await loadRunData('song-1'))?.tracks).toBeUndefined()
  })

  it('deletes the audio tracks with the song', async () => {
    await saveSong(makeSongContent('song-1'))
    await saveRunData({ ...runData('song-1'), tracks: tracks(0) })

    await deleteSong('song-1')

    expect(await loadRunData('song-1')).toBeUndefined()
  })
})

/** Returns two short audio tracks that start at `startMs`. */
function tracks(startMs: number): KeptTracks {
  return {
    vocals: { startMs, sampleRate: 22_050, samples: new Int16Array([1, -2, 3]) },
    instruments: { startMs, sampleRate: 22_050, samples: new Int16Array([-4, 5]) },
  }
}

/** Opens the database at a version and closes it, as another version of the app does. */
function openAtVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('singing-face-timing', version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('database open', () => {
  it('rejects with an error that isNewerDatabaseError knows when a newer version of the app wrote the database', async () => {
    ;(await openAtVersion(4)).close()

    const error: unknown = await openDatabase().catch((failure: unknown) => failure)

    expect(isNewerDatabaseError(error)).toBe(true)
  })

  it('knows no other error as a newer database', () => {
    expect(isNewerDatabaseError(new Error('The quota is exceeded.'))).toBe(false)
    expect(isNewerDatabaseError(null)).toBe(false)
  })

  it('tells each listener when another tab holds an earlier version open, and opens after that tab closes', async () => {
    const other = await openAtVersion(2)
    let heard = 0
    const stop = onDatabaseBlocked(() => {
      heard += 1
      other.close()
    })

    const database = await openDatabase()

    stop()
    expect(heard).toBe(1)
    expect(database.version).toBe(3)
  })
})
