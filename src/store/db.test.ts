import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  deleteSong,
  getAudioFile,
  getRecord,
  listRecords,
  listSongs,
  loadExportOptions,
  loadSong,
  openDatabase,
  putRecord,
  renameSong,
  saveExportOptions,
  saveSong,
  SETTINGS_KEY,
  StorageFullError,
} from './db.ts'
import type { ExportOptions } from '../lib/xtiming/types.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import type { AudioFile, CustomEntry, Voice } from './types.ts'

const STORE_NAMES = [
  'audioFiles',
  'customEntries',
  'marks',
  'sections',
  'settings',
  'songs',
  'voices',
]

function makeAudioFile(songId: string): AudioFile {
  return {
    songId,
    data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
    fileName: 'silent-night.ogg',
    mimeType: 'audio/ogg',
    byteLength: 3,
  }
}

function openVersionOne(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('singing-face-timing', 1)
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('openDatabase', () => {
  it('upgrades a version 1 database with no object stores to version 2 with seven object stores', async () => {
    await openVersionOne()

    const database = await openDatabase()

    expect(database.version).toBe(2)
    expect([...database.objectStoreNames].sort()).toEqual(STORE_NAMES)
  })

  it('returns the same connection to each caller', async () => {
    expect(await openDatabase()).toBe(await openDatabase())
  })

  it('rejects when the browser has no IndexedDB, and opens on a later call', async () => {
    const original = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    await expect(openDatabase()).rejects.toThrow('This browser has no IndexedDB.')
    vi.stubGlobal('indexedDB', original)

    await expect(openDatabase()).resolves.toHaveProperty('version', 2)
  })

  it('rejects when the open request throws', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('The open request is not allowed.')
    })

    await expect(openDatabase()).rejects.toThrow('The open request is not allowed.')
  })

  it('closes the connection when a later version of the app opens the database', async () => {
    await openDatabase()
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('singing-face-timing', 3)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })

    // A new open request at version 2 fails, so the store did not keep the closed connection.
    await expect(openDatabase()).rejects.toHaveProperty('name', 'VersionError')
  })
})

describe('records', () => {
  it('puts, gets and lists a record', async () => {
    const entry: CustomEntry = {
      word: 'NOEL',
      symbols: 'N OW0 EH1 L',
      updatedAt: '2026-11-24T00:00:00.000Z',
    }

    await putRecord('customEntries', entry)
    expect(await getRecord('customEntries', 'NOEL')).toEqual(entry)
    expect(await listRecords('customEntries')).toEqual([entry])
  })

  it('stores the app settings under the settings key', async () => {
    const settings = {
      speechModelId: 'whisper-base',
      device: 'wasm',
      defaultFrameMs: 50,
      theme: 'dark',
    } as const

    await putRecord('settings', settings)

    expect(await getRecord('settings', SETTINGS_KEY)).toEqual(settings)
  })
})

describe('export options', () => {
  const options: ExportOptions = {
    voiceIds: ['voice-1'],
    grouping: 'voice',
    packaging: 'file-per-track',
    writeRest: true,
    trackNames: { 'voice-1': 'Santa' },
  }

  it('stores the export options of each song apart from the app settings', async () => {
    await saveExportOptions('song-1', options)

    expect(await loadExportOptions('song-1')).toEqual(options)
    expect(await loadExportOptions('song-2')).toBeUndefined()
    expect(await getRecord('settings', SETTINGS_KEY)).toBeUndefined()
  })
})

describe('saveSong', () => {
  it('sets updatedAt to the time of the save and keeps createdAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-24T12:00:00.000Z'))
    const content = makeSongContent()

    const saved = await saveSong(content)

    expect(saved.updatedAt).toBe('2026-11-24T12:00:00.000Z')
    expect(saved.createdAt).toBe(content.song.createdAt)
    expect(await listSongs()).toEqual([saved])
  })

  it('keeps the song and its audio file after the connection closes', async () => {
    const content = makeSongContent()
    const saved = await saveSong(content, makeAudioFile(content.song.id))
    await closeDatabase()

    expect(await listSongs()).toEqual([saved])
    const audioFile = await getAudioFile(content.song.id)
    expect(audioFile?.fileName).toBe('silent-night.ogg')
    expect(audioFile?.byteLength).toBe(3)
  })

  it('returns the song with its voices in order, its sections and its marks', async () => {
    const content = makeSongContent()
    const second: Voice = {
      id: 'voice-2',
      songId: content.song.id,
      name: 'Harmony',
      order: -1,
      color: '#5d8fe0',
    }
    const saved = await saveSong({ ...content, voices: [...content.voices, second] })

    const loaded = await loadSong(content.song.id)

    expect(loaded?.song).toEqual(saved)
    expect(loaded?.voices.map((voice) => voice.name)).toEqual(['Harmony', 'Lead Vocals'])
    expect(loaded?.sections).toEqual(content.sections)
    expect(loaded?.marks).toEqual(expect.arrayContaining(content.marks))
    expect(loaded?.marks).toHaveLength(2)
  })

  it('deletes the saved voices, sections and marks that the new content does not have', async () => {
    const content = makeSongContent()
    await saveSong(content)

    await saveSong({ ...content, voices: [], sections: [], marks: [] })

    expect(await listRecords('voices')).toEqual([])
    expect(await listRecords('sections')).toEqual([])
    expect(await listRecords('marks')).toEqual([])
  })

  it('rejects with StorageFullError and saves nothing when the browser storage is full', async () => {
    await openDatabase()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
    })

    const save = saveSong(makeSongContent())

    await expect(save).rejects.toBeInstanceOf(StorageFullError)
    await expect(save).rejects.toThrow('Browser storage is full. Delete a song and try again.')
    vi.restoreAllMocks()
    expect(await listSongs()).toEqual([])
  })

  it('rejects with the original error for a failure that is not a full storage', async () => {
    await openDatabase()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new TypeError('The value cannot be cloned.')
    })

    await expect(saveSong(makeSongContent())).rejects.toThrow('The value cannot be cloned.')
  })
})

describe('loadSong', () => {
  it('returns undefined for an id that no song has', async () => {
    expect(await loadSong('missing')).toBeUndefined()
  })
})

describe('renameSong', () => {
  it('saves the new name and sets updatedAt', async () => {
    const content = makeSongContent()
    await saveSong(content)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T08:00:00.000Z'))

    const renamed = await renameSong(content.song.id, 'Silent Night (live)')

    expect(renamed?.name).toBe('Silent Night (live)')
    expect(renamed?.updatedAt).toBe('2026-12-01T08:00:00.000Z')
    expect(await listSongs()).toEqual([renamed])
  })

  it('returns undefined for an id that no song has', async () => {
    expect(await renameSong('missing', 'Any name')).toBeUndefined()
  })
})

describe('deleteSong', () => {
  it('deletes the song, its audio file, voices, sections, marks and export options, and keeps the other songs', async () => {
    const deleted = makeSongContent('song-1')
    const kept = makeSongContent('song-2')
    await saveSong(deleted, makeAudioFile('song-1'))
    const keptSong = await saveSong(kept, makeAudioFile('song-2'))
    const options: ExportOptions = {
      voiceIds: [],
      grouping: 'voice',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
    }
    await saveExportOptions('song-1', options)
    await saveExportOptions('song-2', options)

    await deleteSong('song-1')

    expect(await listSongs()).toEqual([keptSong])
    expect(await getAudioFile('song-1')).toBeUndefined()
    expect(await getAudioFile('song-2')).toBeDefined()
    expect(await listRecords('voices')).toEqual(kept.voices)
    expect(await listRecords('sections')).toEqual(kept.sections)
    expect(await listRecords('marks')).toEqual(expect.arrayContaining(kept.marks))
    expect(await listRecords('marks')).toHaveLength(kept.marks.length)
    expect(await loadExportOptions('song-1')).toBeUndefined()
    expect(await loadExportOptions('song-2')).toBeDefined()
  })
})
