import { useEffect, useState } from 'react'
import { isNewerDatabaseError, onDatabaseBlocked, openDatabase } from '../store/db.ts'

/**
 * The status of the app database:
 * - `opening`: the open request has not ended.
 * - `ready`: the database is open.
 * - `unavailable`: the browser cannot open the database.
 * - `newer`: a newer version of the app wrote the database, so this version cannot open it.
 * - `blocked`: another tab of the app holds the database open, so the upgrade waits.
 */
export type DatabaseStatus = 'opening' | 'ready' | 'unavailable' | 'newer' | 'blocked'

/** Returns the status of the app database, and opens it once on mount. */
export function useDatabaseStatus(): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>('opening')
  useEffect(() => {
    let active = true
    const stopBlocked = onDatabaseBlocked(() => {
      if (active) setStatus('blocked')
    })
    // The store keeps the connection open for all later reads and writes, so the cleanup does not close it.
    openDatabase().then(
      () => {
        if (active) setStatus('ready')
      },
      (error: unknown) => {
        if (active) setStatus(isNewerDatabaseError(error) ? 'newer' : 'unavailable')
      },
    )
    return () => {
      active = false
      stopBlocked()
    }
  }, [])
  return status
}
