import type { ExportOptions } from '../lib/xtiming/types.ts'
import type {
  AppSettings,
  AudioFile,
  CustomEntry,
  Mark,
  RunData,
  Section,
  Song,
  SongContent,
  Voice,
} from './types.ts'

const DATABASE_NAME = 'singing-face-timing'
const DATABASE_VERSION = 3

/** The key of the one record in the `settings` object store. */
export const SETTINGS_KEY = 'app'

/** The record type of each object store. */
export type StoreRecords = {
  songs: Song
  audioFiles: AudioFile
  voices: Voice
  sections: Section
  marks: Mark
  customEntries: CustomEntry
  settings: AppSettings
  runs: RunData
}

export type StoreName = keyof StoreRecords

const STORES: Record<StoreName, { keyPath: string | null; indexes: string[] }> = {
  songs: { keyPath: 'id', indexes: [] },
  audioFiles: { keyPath: 'songId', indexes: [] },
  voices: { keyPath: 'id', indexes: ['songId'] },
  sections: { keyPath: 'id', indexes: ['songId'] },
  marks: { keyPath: 'id', indexes: ['voiceId'] },
  customEntries: { keyPath: 'word', indexes: [] },
  // AppSettings has no key field, so the one record uses SETTINGS_KEY as an out-of-line key.
  settings: { keyPath: null, indexes: [] },
  runs: { keyPath: 'songId', indexes: [] },
}

const SONG_STORES: StoreName[] = ['songs', 'audioFiles', 'voices', 'sections', 'marks']

/** The error that a write returns when the browser has no free storage for the app. */
export class StorageFullError extends Error {
  constructor() {
    super('Browser storage is full. Delete a song and try again.')
    this.name = 'StorageFullError'
  }
}

let connection: Promise<IDBDatabase> | undefined

/**
 * Returns the one shared connection to the app database, at version 3.
 * The first call opens the database and creates the object stores that are missing.
 * Version 3 adds the `runs` object store, and the upgrade keeps each record of the other object stores.
 * Rejects if the browser has no IndexedDB or refuses the open request.
 */
export function openDatabase(): Promise<IDBDatabase> {
  connection ??= requestDatabase().catch((error: unknown) => {
    // A later call must try to open again, not get the same failure.
    connection = undefined
    throw error
  })
  return connection
}

/** Closes the shared connection. The next call to the database opens a new connection. */
export async function closeDatabase(): Promise<void> {
  const pending = connection
  connection = undefined
  // A failed open has no connection to close.
  const database = await pending?.catch(() => undefined)
  database?.close()
}

function requestDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB.'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    } catch (error) {
      // Some private windows throw on open instead of firing an error event.
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    request.onupgradeneeded = () => createMissingStores(request.result)
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        // A later version of the app cannot upgrade the database while this connection stays open.
        database.close()
        connection = undefined
      }
      resolve(database)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB refused the open request.'))
  })
}

// Version 1 has no object stores, and each later version only adds object stores, so one upgrade serves each earlier version.
function createMissingStores(database: IDBDatabase): void {
  for (const [name, { keyPath, indexes }] of Object.entries(STORES)) {
    if (database.objectStoreNames.contains(name)) continue
    const store = database.createObjectStore(name, keyPath === null ? undefined : { keyPath })
    for (const index of indexes) store.createIndex(index, index)
  }
}

function toStorageError(error: unknown): Error {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : ''
  if (name === 'QuotaExceededError') return new StorageFullError()
  if (error instanceof Error) return error
  return new Error('IndexedDB stopped the transaction.')
}

/**
 * Runs `work` in one transaction and returns the value of its `read` function after the
 * transaction completes. Rejects with StorageFullError when the browser storage is full.
 */
async function transact<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => () => T,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let started: IDBTransaction | undefined
    try {
      const transaction = database.transaction(names, mode)
      started = transaction
      const read = work(transaction)
      transaction.oncomplete = () => resolve(read())
      transaction.onabort = () => reject(toStorageError(transaction.error))
    } catch (error) {
      // A write can throw before IndexedDB starts it, and the abort removes the earlier writes.
      started?.abort()
      reject(toStorageError(error))
    }
  })
}

const nothing = () => undefined

/** Returns the record with `key` in `store`, or undefined if the store has no such record. */
export function getRecord<S extends StoreName>(
  store: S,
  key: IDBValidKey,
): Promise<StoreRecords[S] | undefined> {
  return transact([store], 'readonly', (transaction) => {
    const request = transaction.objectStore(store).get(key)
    return () => request.result
  })
}

/** Returns all records in `store`, in key order. */
export function listRecords<S extends StoreName>(store: S): Promise<StoreRecords[S][]> {
  return transact([store], 'readonly', (transaction) => {
    const request = transaction.objectStore(store).getAll()
    return () => request.result
  })
}

/**
 * Writes `value` to `store` as given, and replaces a record with the same key.
 * Use saveSong to write a song, because saveSong sets `updatedAt`.
 * Rejects with StorageFullError when the browser storage is full.
 */
export function putRecord<S extends StoreName>(store: S, value: StoreRecords[S]): Promise<void> {
  return transact([store], 'readwrite', (transaction) => {
    const objectStore = transaction.objectStore(store)
    if (store === 'settings') objectStore.put(value, SETTINGS_KEY)
    else objectStore.put(value)
    return nothing
  })
}

/**
 * Writes the custom entries in one transaction. An entry replaces the saved entry with the same word.
 * Rejects with StorageFullError when the browser storage is full. Nothing is saved then.
 */
export function putCustomEntryRecords(entries: readonly CustomEntry[]): Promise<void> {
  return transact(['customEntries'], 'readwrite', (transaction) => {
    const store = transaction.objectStore('customEntries')
    for (const entry of entries) store.put(entry)
    return nothing
  })
}

/** Deletes the custom entry of the word. A word with no entry changes nothing. */
export function deleteCustomEntryRecord(word: string): Promise<void> {
  return transact(['customEntries'], 'readwrite', (transaction) => {
    transaction.objectStore('customEntries').delete(word)
    return nothing
  })
}

// The settings store holds one record for the app and one for the export options of each song.
function exportOptionsKey(songId: string): string {
  return `export:${songId}`
}

/** The export options of a song in the form that the `settings` object store holds. */
export type StoredExportOptions = ExportOptions & {
  /** The ids of all voices of the song at the export. A voice outside this list is new to the options. */
  knownVoiceIds: string[]
  /** True when the person selected "Everything as one zip file". Options from before the zip file have no value. */
  zip?: boolean
}

/** Returns the export options of the previous export of the song, or undefined if the song has none. */
export function loadExportOptions(songId: string): Promise<StoredExportOptions | undefined> {
  return transact(['settings'], 'readonly', (transaction) => {
    const request = transaction.objectStore('settings').get(exportOptionsKey(songId))
    return () => request.result
  })
}

/**
 * Stores the export options of the song in the `settings` object store, and replaces the previous options.
 * Rejects with StorageFullError when the browser storage is full.
 */
export function saveExportOptions(songId: string, options: StoredExportOptions): Promise<void> {
  return transact(['settings'], 'readwrite', (transaction) => {
    transaction.objectStore('settings').put(options, exportOptionsKey(songId))
    return nothing
  })
}

/** Returns all saved songs, in key order. */
export function listSongs(): Promise<Song[]> {
  return listRecords('songs')
}

/** Returns the audio file of the song, or undefined if the song has no audio file. */
export function getAudioFile(songId: string): Promise<AudioFile | undefined> {
  return getRecord('audioFiles', songId)
}

/**
 * Returns the song with its voices (in `order`), sections and marks, without the audio file.
 * Returns undefined if no song has the id.
 */
export function loadSong(songId: string): Promise<SongContent | undefined> {
  return transact(['songs', 'voices', 'sections', 'marks'], 'readonly', (transaction) => {
    const song = transaction.objectStore('songs').get(songId)
    const voices = transaction.objectStore('voices').index('songId').getAll(songId)
    const sections = transaction.objectStore('sections').index('songId').getAll(songId)
    const marks: Mark[] = []
    voices.onsuccess = () => {
      for (const voice of voices.result) {
        const request = transaction.objectStore('marks').index('voiceId').getAll(voice.id)
        request.onsuccess = () => marks.push(...request.result)
      }
    }
    return () => {
      const found: Song | undefined = song.result
      if (!found) return undefined
      const ordered: Voice[] = [...voices.result].sort((a, b) => a.order - b.order)
      return { song: found, voices: ordered, sections: sections.result, marks }
    }
  })
}

/**
 * Deletes the voices, sections and marks of a song that are not in `keep`.
 * The deletes run after the reads of the indexes, so a put earlier in the same
 * transaction stays when its id is in `keep`.
 */
function deleteStaleChildren(transaction: IDBTransaction, songId: string, keep: Set<string>): void {
  const marks = transaction.objectStore('marks')
  const deleteStale = (store: IDBObjectStore, index: string, parentKey: IDBValidKey) => {
    const request = store.index(index).getAllKeys(parentKey)
    request.onsuccess = () => {
      for (const key of request.result) if (!keep.has(String(key))) store.delete(key)
    }
    return request
  }
  deleteStale(transaction.objectStore('sections'), 'songId', songId)
  const voices = deleteStale(transaction.objectStore('voices'), 'songId', songId)
  voices.addEventListener('success', () => {
    for (const voiceKey of voices.result) deleteStale(marks, 'voiceId', voiceKey)
  })
}

/**
 * Saves the song with its voices, sections and marks in one transaction, and returns the
 * saved song. The save sets `updatedAt` to the current time. Saved voices, sections and
 * marks that are absent from `content` are deleted.
 * @param content The song and all voices, sections and marks that belong to it.
 * @param audioFile The audio file to store with a new song. Omit it for a later save.
 * Rejects with StorageFullError when the browser storage is full. Nothing is saved then.
 */
export function saveSong(content: SongContent, audioFile?: AudioFile): Promise<Song> {
  const song: Song = { ...content.song, updatedAt: new Date().toISOString() }
  const keep = new Set<string>([
    ...content.voices.map((voice) => voice.id),
    ...content.sections.map((section) => section.id),
    ...content.marks.map((mark) => mark.id),
  ])
  return transact(SONG_STORES, 'readwrite', (transaction) => {
    transaction.objectStore('songs').put(song)
    if (audioFile) transaction.objectStore('audioFiles').put(audioFile)
    for (const voice of content.voices) transaction.objectStore('voices').put(voice)
    for (const section of content.sections) transaction.objectStore('sections').put(section)
    for (const mark of content.marks) transaction.objectStore('marks').put(mark)
    deleteStaleChildren(transaction, song.id, keep)
    return () => song
  })
}

/**
 * Gives the song a new name, sets `updatedAt`, and returns the saved song.
 * Returns undefined if no song has the id.
 */
export function renameSong(songId: string, name: string): Promise<Song | undefined> {
  return transact(['songs'], 'readwrite', (transaction) => {
    const store = transaction.objectStore('songs')
    const request = store.get(songId)
    let renamed: Song | undefined
    request.onsuccess = () => {
      const song: Song | undefined = request.result
      if (!song) return
      renamed = { ...song, name, updatedAt: new Date().toISOString() }
      store.put(renamed)
    }
    return () => renamed
  })
}

/**
 * Deletes the song, its audio file, its voices, its sections, their marks, its export options
 * and the data of its last run in one transaction.
 */
export function deleteSong(songId: string): Promise<void> {
  return transact([...SONG_STORES, 'settings', 'runs'], 'readwrite', (transaction) => {
    transaction.objectStore('songs').delete(songId)
    transaction.objectStore('audioFiles').delete(songId)
    transaction.objectStore('runs').delete(songId)
    transaction.objectStore('settings').delete(exportOptionsKey(songId))
    deleteStaleChildren(transaction, songId, new Set())
    return nothing
  })
}

/** The functions that hear of each new run data. */
const runDataListeners = new Set<(songId: string) => void>()

/**
 * Calls `listener` with the song id after each write of `saveRunData` completes.
 * Returns the function that stops the calls.
 */
export function onRunDataSaved(listener: (songId: string) => void): () => void {
  runDataListeners.add(listener)
  return () => runDataListeners.delete(listener)
}

/** Returns the data of the last completed run of the song, or undefined if the song has no run data. */
export function loadRunData(songId: string): Promise<RunData | undefined> {
  return getRecord('runs', songId)
}

/**
 * Writes the data of a run in one transaction, and replaces the singer ranges and the report of the earlier run.
 * After the write, each listener of `onRunDataSaved` hears of it.
 * Rejects with StorageFullError when the browser storage is full. The earlier run data then stays.
 */
export async function saveRunData(data: RunData): Promise<void> {
  await putRecord('runs', data)
  for (const listener of runDataListeners) listener(data.songId)
}
