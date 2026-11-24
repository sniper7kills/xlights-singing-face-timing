import { entryKey } from '../lib/dictionary/customDictionaryFile.ts'
import type { Dictionary } from '../lib/dictionary/types.ts'
import { rebreakForEntries } from './actions/breakDown.ts'
import { deleteCustomEntryRecord, listRecords, putCustomEntryRecords } from './db.ts'
import type { CustomEntry } from './types.ts'

/** A custom entry that the person supplies. The store sets `updatedAt`. */
export type CustomEntryInput = Pick<CustomEntry, 'word' | 'symbols'>

/** The word of a custom entry has no letter, so no word of a song can match the entry. */
export class CustomEntryWordError extends Error {
  constructor(word: string) {
    super(`The word "${word}" has no letter.`)
    this.name = 'CustomEntryWordError'
  }
}

// The break down reads the custom dictionary for each word, so the app keeps a copy in memory.
let copy: Promise<Dictionary> | undefined
let loadedCopy: Dictionary | undefined

async function readCopy(): Promise<Dictionary> {
  const entries = await listRecords('customEntries')
  loadedCopy = Object.fromEntries(entries.map((entry) => [entry.word, entry.symbols]))
  return loadedCopy
}

/**
 * Returns the in-memory copy of the custom dictionary, in the shape that `lookup` reads.
 * The first call reads the database. Each write of this module refreshes the copy.
 * Rejects if the database cannot read the entries.
 */
export function customDictionary(): Promise<Dictionary> {
  copy ??= readCopy().catch((error: unknown) => {
    // A later call must read again, not get the same failure.
    copy = undefined
    throw error
  })
  return copy
}

/**
 * Returns the last in-memory copy of the custom dictionary that a read gave, or undefined before the first read.
 * A store action that cannot wait for the database reads it here.
 */
export function loadedCustomDictionary(): Dictionary | undefined {
  return loadedCopy
}

/** Returns all saved custom entries, in word order. */
export function listCustomEntries(): Promise<CustomEntry[]> {
  return listRecords('customEntries')
}

async function refresh(words: readonly string[]): Promise<void> {
  copy = undefined
  await customDictionary()
  await rebreakForEntries(words)
}

/**
 * Saves one custom entry and breaks down again the matching unedited words of the open song.
 * The store normalises the word. An entry replaces the saved entry with the same normalised word.
 * @param entry The word, and its CMU symbols separated by one space.
 * Rejects with CustomEntryWordError when the normalised word has no letter and no digit, or has only digits. Nothing is saved then.
 * Rejects with StorageFullError when the browser storage is full.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The entry is saved then.
 */
export async function putCustomEntry(entry: CustomEntryInput): Promise<void> {
  const skipped = await putCustomEntries([entry])
  if (skipped.length > 0) throw new CustomEntryWordError(entry.word)
}

/**
 * Saves the custom entries in one transaction, and returns the words of the entries that it skips.
 * The save breaks down again the matching unedited words of the open song, as one undo step.
 * The store normalises each word, so every caller stores the key that `lookup` reads.
 * The save skips an entry whose normalised word has no letter and no digit, or has only digits.
 * An entry replaces the saved entry with the same normalised word. If two entries have the same normalised word, the later entry stays.
 * @param entries The words, and their CMU symbols separated by one space.
 * Rejects with StorageFullError when the browser storage is full. Nothing is saved then.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The entries are saved then.
 */
export async function putCustomEntries(entries: readonly CustomEntryInput[]): Promise<string[]> {
  const updatedAt = new Date().toISOString()
  const records = new Map<string, CustomEntry>()
  const skipped: string[] = []
  for (const { word, symbols } of entries) {
    const key = entryKey(word)
    if (key === undefined) skipped.push(word)
    else records.set(key, { word: key, symbols, updatedAt })
  }
  if (records.size === 0) return skipped
  await putCustomEntryRecords([...records.values()])
  await refresh([...records.keys()])
  return skipped
}

/**
 * Deletes the custom entry of the word and breaks down again the matching unedited words of the open song.
 * The words then get the dictionary result again.
 * @param word The word of the entry, in upper case.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The entry is deleted then.
 */
export async function deleteCustomEntry(word: string): Promise<void> {
  await deleteCustomEntryRecord(word)
  await refresh([word])
}
