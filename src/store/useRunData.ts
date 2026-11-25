import { useEffect, useState } from 'react'
import { loadRunData, onRunDataSaved } from './db.ts'
import type { RunData } from './types.ts'

/** The value of `useRunData` after a failed read of the run data. */
export const RUN_DATA_FAILED = 'failed' as const

/** The message of a failed read of the run data. The "Run report" action and the place of the track rows show it. */
export const RUN_DATA_FAILED_NOTE =
  'The app could not read the run report and the separated tracks of this song. Reload the page.'

type RunDataValue = RunData | undefined | typeof RUN_DATA_FAILED

/**
 * Returns the data of the last completed run of the song, and reads it again after each new run of the song.
 * Returns null while the first read runs, undefined for a song with no run data, and `RUN_DATA_FAILED` for a failed read.
 * @param songId The id of the song, or null for no song.
 */
export function useRunData(songId: string | null): RunDataValue | null {
  const [data, setData] = useState<{ songId: string | null; value: RunDataValue } | null>(null)
  useEffect(() => {
    if (songId === null) return
    let active = true
    const read = () =>
      void loadRunData(songId)
        .catch((): RunDataValue => RUN_DATA_FAILED)
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

/** Returns the run data of a value of `useRunData`, or undefined while it loads, for no run data or for a failed read. */
export function runDataOf(value: RunDataValue | null): RunData | undefined {
  return value === null || value === RUN_DATA_FAILED ? undefined : value
}
