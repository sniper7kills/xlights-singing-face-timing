import { listSongs } from '../../store/db.ts'

/** The storage that the app uses, the storage that the browser allows, and the persistence. */
export type StorageState = {
  usedBytes: number
  quotaBytes: number
  /** False when the browser can remove the app data under storage pressure. */
  persisted: boolean
}

// The Storage API exists only in a secure context, so a plain-HTTP page has no navigator.storage.
function storageManager(): StorageManager | undefined {
  return 'storage' in navigator ? navigator.storage : undefined
}

/**
 * Requests persistent storage from the browser when the database holds exactly one song
 * (FR-audio-18). Resolves to the answer of the browser, or to undefined when the app makes
 * no request. A refusal and a browser without the Storage API both resolve to false.
 */
export async function requestPersistentStorageForFirstSong(): Promise<boolean | undefined> {
  if ((await listSongs()).length !== 1) return undefined
  const storage = storageManager()
  if (!storage) return false
  // A TypeError means that the browser has no storage for the origin, which is also a refusal.
  return storage.persist().catch(() => false)
}

/**
 * Returns the storage that the app uses and allows, in bytes, and whether the storage is
 * persistent. Returns null when the browser has no Storage API or cannot give an estimate.
 */
export async function readStorageState(): Promise<StorageState | null> {
  const storage = storageManager()
  if (!storage) return null
  try {
    const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted()])
    return { usedBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0, persisted }
  } catch {
    // A TypeError means that the browser has no storage for the origin, so no meter shows.
    return null
  }
}
