import { useEffect } from 'react'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { useSongStore } from '../../store/songStore.ts'

type EditorPageProps = {
  songId: string
}

/** Shows the editor for one song. Issue #12 adds the waveform and play. */
export function EditorPage({ songId }: EditorPageProps) {
  const song = useSongStore((state) => state.current?.song)
  const openSong = useSongStore((state) => state.openSong)

  useEffect(() => {
    void openSong(songId).then((found) => {
      // A link to a deleted song goes back to the song library, the same as an unknown hash.
      if (!found) window.location.replace(LIBRARY_HASH)
    })
  }, [openSong, songId])

  if (song?.id !== songId) return null
  return (
    <section className="editor" aria-labelledby="editor-title">
      <h2 id="editor-title">{song.name}</h2>
    </section>
  )
}
