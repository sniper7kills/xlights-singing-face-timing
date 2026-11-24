import { useEffect, useState } from 'react'
import { openDatabase } from '../store/db.ts'

export type DatabaseStatus = 'opening' | 'ready' | 'unavailable'

/** Returns the status of the app database, and opens it once on mount. */
export function useDatabaseStatus(): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>('opening')
  useEffect(() => {
    let active = true
    // The store keeps the connection open for all later reads and writes, so the cleanup does not close it.
    openDatabase().then(
      () => {
        if (active) setStatus('ready')
      },
      () => {
        if (active) setStatus('unavailable')
      },
    )
    return () => {
      active = false
    }
  }, [])
  return status
}
