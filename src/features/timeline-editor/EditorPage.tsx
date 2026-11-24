import { useEffect } from 'react'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { useAutosaveStore, useSaveState } from '../../store/autosave.ts'
import { StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Layers } from './Layers.tsx'
import { Waveform } from './Waveform.tsx'

type EditorPageProps = {
  songId: string
}

// TODO(#17): Open the transcribe dialog.
function openTranscribeDialog() {}

/** Shows the editor for one song: the top bar, the waveform region and the layers. */
export function EditorPage({ songId }: EditorPageProps) {
  const content = useSongStore((state) => state.current)
  const openSong = useSongStore((state) => state.openSong)
  const saveState = useSaveState()
  const saveError = useAutosaveStore((state) => state.error)

  useEffect(() => {
    let active = true
    // Each song opens at the default view: the full song in the width, at time 0.
    useViewStore.getState().resetView()
    void openSong(songId)
      // A song that the app cannot read gets the same result as a deleted song.
      .catch(() => false)
      .then((found) => {
        // A link to a deleted song goes back to the song library, the same as an unknown hash.
        if (active && !found) window.location.replace(LIBRARY_HASH)
      })
    return () => {
      // An open that ends after the person left the editor must not change the route.
      active = false
      // The close saves a pending change, so the next open reads the saved change.
      useSongStore.getState().closeSong()
    }
  }, [openSong, songId])

  if (content?.song.id !== songId) return null
  const { song } = content
  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="editor-top">
        <a className="button" href={LIBRARY_HASH} aria-label="Back to song library">
          <span aria-hidden="true">←</span>
        </a>
        <h2 id="editor-title">{song.name}</h2>
        <span className="spacer" />
        <span className="save-state" role="status">
          {saveState === 'saved' ? 'Saved' : 'Saving'}
        </span>
      </div>
      {saveError instanceof StorageFullError && (
        <p className="message" role="alert">
          {saveError.message}
        </p>
      )}
      <Waveform key={songId} songId={songId}>
        <Layers content={content} onTranscribe={openTranscribeDialog} />
      </Waveform>
    </section>
  )
}
