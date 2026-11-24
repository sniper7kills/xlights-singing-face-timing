import { useCallback, useEffect, useRef, useState } from 'react'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { useAutosaveStore, useSaveState } from '../../store/autosave.ts'
import { StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import type { TranscribeOutcome } from '../transcription/runTranscription.ts'
import { TranscribeDialog } from '../transcription/TranscribeDialog.tsx'
import { outcomeText } from '../transcription/transcribeDialogState.ts'
import { Layers } from './Layers.tsx'
import { Waveform } from './Waveform.tsx'

/** The time that the toast after a transcribe run stays on the screen. */
const TOAST_MS = 6000

type EditorPageProps = {
  songId: string
}

/** Shows the editor for one song: the top bar, the waveform region and the layers. */
export function EditorPage({ songId }: EditorPageProps) {
  const content = useSongStore((state) => state.current)
  const openSong = useSongStore((state) => state.openSong)
  const saveState = useSaveState()
  const saveError = useAutosaveStore((state) => state.error)
  const selectedVoiceId = useViewStore((state) => state.selectedVoiceId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const openTranscribeDialog = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDialogOpen(true)
  }, [])

  const closeTranscribeDialog = useCallback(() => {
    setDialogOpen(false)
    setRunning(false)
  }, [])

  const finishTranscribe = useCallback(
    (outcome: TranscribeOutcome) => {
      setToast(outcomeText(outcome))
      closeTranscribeDialog()
    },
    [closeTranscribeDialog],
  )

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    // The action is disabled until the render after the run, and a disabled button takes no focus.
    if (dialogOpen || opener.current === null) return
    opener.current.focus()
    opener.current = null
  }, [dialogOpen])

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
  const voice = selectedVoice(content.voices, selectedVoiceId)
  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="editor-top">
        <a className="button" href={LIBRARY_HASH} aria-label="Back to song library">
          <span aria-hidden="true">←</span>
        </a>
        <h2 id="editor-title">{song.name}</h2>
        <span className="spacer" />
        {voice !== undefined && (
          <button
            type="button"
            className="button primary"
            disabled={running}
            onClick={openTranscribeDialog}
          >
            Transcribe
          </button>
        )}
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
      {dialogOpen && voice !== undefined && (
        <TranscribeDialog
          voiceId={voice.id}
          durationMs={song.durationMs}
          onActiveChange={setRunning}
          onClose={closeTranscribeDialog}
          onDone={finishTranscribe}
        />
      )}
      {toast !== null && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </section>
  )
}
