import { DropZone } from '../features/audio-import/DropZone.tsx'
import type { DatabaseStatus } from './database.ts'
import { songHash } from './routes.ts'

type SongLibraryPageProps = {
  databaseStatus: DatabaseStatus
}

export function SongLibraryPage({ databaseStatus }: SongLibraryPageProps) {
  if (databaseStatus === 'unavailable') {
    return (
      <p className="message" role="alert">
        This browser cannot store songs. Use a current Chrome, Edge or Firefox.
      </p>
    )
  }
  if (databaseStatus === 'opening') return null
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title">No songs yet</h2>
      <DropZone onSongCreated={(song) => window.location.assign(songHash(song.id))} />
    </section>
  )
}
