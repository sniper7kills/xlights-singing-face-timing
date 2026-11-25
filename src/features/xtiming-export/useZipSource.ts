import { useEffect, useState } from 'react'
import { listCustomEntries } from '../../store/customEntries.ts'
import { getAudioFile, loadRunData } from '../../store/db.ts'
import type { AudioFile, CustomEntry, RunData } from '../../store/types.ts'

/**
 * The stored files that the zip file of a song needs besides the song content.
 * `runData` is the data of the last run of the song, or undefined when the song has none.
 */
export type ZipSource = { audio: AudioFile; customEntries: CustomEntry[]; runData?: RunData }

/** The state of the read: `loading`, `failed`, or the files. */
export type ZipSourceState = ZipSource | 'loading' | 'failed'

/** The message when the app cannot read the audio file of the song for the zip file. */
export const AUDIO_READ_MESSAGE =
  'The app could not read the audio file of this song. Download the timing files without the zip.'

async function readZipSource(songId: string): Promise<ZipSource | 'failed'> {
  try {
    const [audio, customEntries, runData] = await Promise.all([
      getAudioFile(songId),
      listCustomEntries(),
      // The tracks and the report are extra files, so a failed read gives a zip file without them.
      loadRunData(songId).catch(() => undefined),
    ])
    if (!audio) return 'failed'
    return runData === undefined ? { audio, customEntries } : { audio, customEntries, runData }
  } catch {
    return 'failed'
  }
}

/**
 * Returns the audio file record, the custom entries and the run data for the zip file of the song.
 * The hook reads them the first time that `enabled` is true, so an export without the zip file reads nothing.
 * The record holds a reference to the audio bytes. The download reads the bytes.
 * @param songId The id of the song.
 * @param enabled True when the person selected "Everything as one zip file".
 */
export function useZipSource(songId: string, enabled: boolean): ZipSourceState {
  const [state, setState] = useState<ZipSourceState>('loading')
  const [requested, setRequested] = useState(false)
  if (enabled && !requested) setRequested(true)

  useEffect(() => {
    if (!requested) return
    let current = true
    void readZipSource(songId).then((result) => {
      if (current) setState(result)
    })
    return () => {
      current = false
    }
  }, [requested, songId])

  return state
}
