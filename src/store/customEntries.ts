import type { Dictionary } from '../lib/dictionary/types.ts'
import { rebreakForEntries } from './actions/breakDown.ts'
import { deleteCustomEntryRecord, listRecords, putCustomEntryRecords } from './db.ts'
import type { CustomEntry } from './types.ts'

/** A custom entry that the person supplies. The store sets `updatedAt`. */
export type CustomEntryInput = Pick<CustomEntry, 'word' | 'symbols'>

// The break down reads the custom dictionary for each word, so the app keeps a copy in memory.
let copy: Promise<Dictionary> | undefined

async function readCopy(): Promise<Dictionary> {
  const entries = await listRecords('customEntries')
  return Object.fromEntries(entries.map((entry) => [entry.word, entry.symbols]))
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
 * An entry replaces the saved entry with the same word.
 * @param entry The word in upper case, and its CMU symbols separated by one space.
 * Rejects with StorageFullError when the browser storage is full.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The entry is saved then.
 */
export function putCustomEntry(entry: CustomEntryInput): Promise<void> {
  return putCustomEntries([entry])
}

/**
 * Saves the custom entries in one transaction and breaks down again the matching unedited words of the open song, as one undo step.
 * An entry replaces the saved entry with the same word. If two entries have the same word, the later entry stays.
 * @param entries The words in upper case, and their CMU symbols separated by one space.
 * Rejects with StorageFullError when the browser storage is full. Nothing is saved then.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The entries are saved then.
 */
export async function putCustomEntries(entries: readonly CustomEntryInput[]): Promise<void> {
  const updatedAt = new Date().toISOString()
  await putCustomEntryRecords(entries.map(({ word, symbols }) => ({ word, symbols, updatedAt })))
  await refresh(entries.map((entry) => entry.word))
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
