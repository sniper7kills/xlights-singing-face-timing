import { useCallback, useEffect, useState } from 'react'
import { createDemoSong, DemoSongError } from '../features/audio-import/createDemoSong.ts'
import { DropZone } from '../features/audio-import/DropZone.tsx'
import { HowItWorks } from '../features/audio-import/HowItWorks.tsx'
import { readStorageState, type StorageState } from '../features/audio-import/persistentStorage.ts'
import { SongList } from '../features/audio-import/SongList.tsx'
import { StorageMeter } from '../features/audio-import/StorageMeter.tsx'
import { deleteSong, listSongs, renameSong, StorageFullError } from '../store/db.ts'
import { useSongStore } from '../store/songStore.ts'
import type { Song } from '../store/types.ts'
import type { DatabaseStatus } from './database.ts'
import { songHash } from './routes.ts'

type SongLibraryPageProps = {
  databaseStatus: DatabaseStatus
}

/** The message for each database status that keeps the song library closed. */
const DATABASE_MESSAGE: Partial<Record<DatabaseStatus, string>> = {
  unavailable: 'This browser cannot store songs. Use a current Chrome, Edge or Firefox.',
  newer:
    'This browser holds data from a newer version of the app. Reload the page. If the message stays, close the other tabs of the app and reload.',
  blocked: 'Close the other tabs of the app. Then reload this page.',
}

export function SongLibraryPage({ databaseStatus }: SongLibraryPageProps) {
  const message = DATABASE_MESSAGE[databaseStatus]
  if (message !== undefined) {
    return (
      <p className="message" role="alert">
        {message}
      </p>
    )
  }
  if (databaseStatus === 'opening') return null
  return (
    <>
      <SongLibrary />
      {/* A person who reports a problem can name the version of the app. */}
      <footer className="library-foot">
        <small>Build {__APP_BUILD__}</small>
      </footer>
    </>
  )
}

/**
 * Closes the song if it is open in the editor store.
 * The close saves a pending change first, so a later rename or delete is the last write.
 */
function closeIfOpen(songId: string) {
  const { current, closeSong } = useSongStore.getState()
  if (current?.song.id === songId) closeSong()
}

function SongLibrary() {
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [storage, setStorage] = useState<StorageState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)

  const refresh = useCallback(async () => {
    const [saved, state] = await Promise.all([listSongs(), readStorageState()])
    setSongs(saved)
    setStorage(state)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function change(write: () => Promise<unknown>) {
    setError(null)
    try {
      await write()
    } catch (failure) {
      if (!(failure instanceof StorageFullError)) throw failure
      setError(failure.message)
    }
    await refresh()
  }

  async function addDemoSong() {
    setError(null)
    setDemoLoading(true)
    try {
      const song = await createDemoSong()
      window.location.assign(songHash(song.id))
    } catch (failure) {
      if (!(failure instanceof DemoSongError || failure instanceof StorageFullError)) throw failure
      setError(failure.message)
    } finally {
      setDemoLoading(false)
    }
  }

  if (songs === null) return null

  const dropZone = (
    <DropZone
      compact={songs.length > 0}
      onSongCreated={(song) => window.location.assign(songHash(song.id))}
    >
      {songs.length === 0 && (
        <button
          type="button"
          className="button"
          disabled={demoLoading}
          onClick={() => void addDemoSong()}
        >
          Try the demo song
        </button>
      )}
    </DropZone>
  )
  const aside = (
    <aside className={songs.length > 0 ? 'library-aside' : 'library-aside library-wide'}>
      {storage && <StorageMeter storage={storage} showPersistenceNote={songs.length > 0} />}
      <HowItWorks />
    </aside>
  )
  const message = error && (
    <p className="message" role="alert">
      {error}
    </p>
  )

  if (songs.length === 0) {
    return (
      <div className="library">
        <section className="empty library-wide" aria-labelledby="empty-title">
          <h2 id="empty-title">No songs yet</h2>
          {message}
          {dropZone}
        </section>
        {aside}
      </div>
    )
  }
  return (
    <div className="library">
      <div className="library-wide">{dropZone}</div>
      {message && <div className="library-wide">{message}</div>}
      <SongList
        songs={songs}
        onRename={(songId, name) =>
          change(() => {
            closeIfOpen(songId)
            return renameSong(songId, name)
          })
        }
        onDelete={(songId) =>
          change(() => {
            closeIfOpen(songId)
            return deleteSong(songId)
          })
        }
      />
      {aside}
    </div>
  )
}
