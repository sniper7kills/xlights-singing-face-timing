import { useEffect, useState } from 'react'
import { loadRunData, onRunDataSaved } from './db.ts'
import type { RunData } from './types.ts'

/**
 * Returns the data of the last completed run of the song, and reads it again after each new run of the song.
 * Returns null while the first read runs, and undefined for a song with no run data or a failed read.
 * @param songId The id of the song, or null for no song.
 */
export function useRunData(songId: string | null): RunData | undefined | null {
  const [data, setData] = useState<{ songId: string | null; value: RunData | undefined } | null>(
    null,
  )
  useEffect(() => {
    if (songId === null) return
    let active = true
    const read = () =>
      void loadRunData(songId)
        .catch(() => undefined)
        .then((value) => {
          if (active) setData({ songId, value })
        })
    read()
    const stop = onRunDataSaved((saved) => {
      if (saved === songId) read()
    })
    return () => {
      active = false
      stop()
    }
  }, [songId])
  if (songId === null) return undefined
  return data?.songId === songId ? data.value : null
}
