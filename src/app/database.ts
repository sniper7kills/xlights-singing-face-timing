import { useEffect, useState } from 'react'

const DATABASE_NAME = 'singing-face-timing'
const DATABASE_VERSION = 1

/**
 * Opens the app database at version 1 with no object stores.
 * Rejects if the browser has no IndexedDB or refuses the open request.
 */
export function openDatabase(): Promise<IDBDatabase> {
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
    request.onsuccess = () => {
      const database = request.result
      // A later version of the app cannot upgrade the database while this connection stays open.
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused the open request.'))
  })
}

export type DatabaseStatus = 'opening' | 'ready' | 'unavailable'

/** Returns the status of the app database, and opens it once on mount. */
export function useDatabaseStatus(): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>('opening')
  useEffect(() => {
    let active = true
    let database: IDBDatabase | undefined
    openDatabase().then(
      (opened) => {
        database = opened
        if (active) setStatus('ready')
      },
      () => {
        if (active) setStatus('unavailable')
      },
    )
    return () => {
      active = false
      database?.close()
    }
  }, [])
  return status
}
