import { getRecord, saveSong, SETTINGS_KEY } from '../../store/db.ts'
import type { Mark, Song, Voice } from '../../store/types.ts'
import { requestPersistentStorageForFirstSong } from './persistentStorage.ts'

/** The name of the one voice in a new song. */
export const DEFAULT_VOICE_NAME = 'Lead Vocals'

// The spec has no list of the 8 preset colours yet. This is the colour of "Lead Vocals" in the editor mockup.
const DEFAULT_VOICE_COLOR = '#ffb238'

const DEFAULT_FRAME_MS = 50

export type NewSong = {
  name: string
  durationMs: number
  /** The original bytes of the audio file, stored without a change. */
  audio: { data: Blob; fileName: string; mimeType: string }
  /** The voices of the song. Each id must be unique in the database. Omit for one "Lead Vocals" voice. */
  voices?: Omit<Voice, 'songId'>[]
  /** The marks of the voices. Each id must be unique in the database. */
  marks?: Mark[]
}

/**
 * Creates a song with its voices, marks and audio file, stores them in one transaction,
 * and returns the stored song.
 * The `frameMs` of the song comes from the app settings, and is 50 when no settings exist.
 * After the first song, it requests persistent storage and does not wait for the answer.
 * @param newSong The name, the duration, the audio file, and optional voices and marks.
 * Rejects with StorageFullError when the browser storage is full. Nothing is stored then.
 */
export async function storeNewSong(newSong: NewSong): Promise<Song> {
  const { name, durationMs, audio, marks = [] } = newSong
  const songId = crypto.randomUUID()
  const settings = await getRecord('settings', SETTINGS_KEY)
  const now = new Date().toISOString()
  const song: Song = {
    id: songId,
    name,
    durationMs,
    frameMs: settings?.defaultFrameMs ?? DEFAULT_FRAME_MS,
    createdAt: now,
    updatedAt: now,
  }
  const voices = (
    newSong.voices ?? [
      { id: crypto.randomUUID(), name: DEFAULT_VOICE_NAME, order: 0, color: DEFAULT_VOICE_COLOR },
    ]
  ).map((voice) => ({ ...voice, songId }))
  const stored = await saveSong(
    { song, voices, sections: [], marks },
    {
      songId,
      data: audio.data,
      fileName: audio.fileName,
      mimeType: audio.mimeType,
      byteLength: audio.data.size,
    },
  )
  // Firefox asks the person, so the editor opens before the answer.
  void requestPersistentStorageForFirstSong()
  return stored
}
