import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { Song } from '../../store/types.ts'
import {
  ACCEPTED_EXTENSIONS,
  createSongFromFile,
  ImportError,
  isAcceptedAudioFile,
} from './createSongFromFile.ts'

export type DropZoneProps = {
  /** Receives the stored song after the decode ends. */
  onSongCreated: (song: Song) => void
  /** Shows the drop zone as a band above the song list. */
  compact?: boolean
  /** Extra buttons that show beside "Add a song" when no file decodes. */
  children?: ReactNode
}

type DropZoneState =
  { name: 'empty' } | { name: 'loading'; fileName: string } | { name: 'error'; message: string }

/**
 * Shows the drop zone of the song library. It takes one audio file from the file dialog
 * or from drag and drop, creates a song from it, and gives the song to `onSongCreated`.
 */
export function DropZone({ onSongCreated, compact = false, children }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<DropZoneState>({ name: 'empty' })
  const [dragOver, setDragOver] = useState(false)
  const [oneFileNote, setOneFileNote] = useState(false)
  const loading = state.name === 'loading'

  async function addFiles(files: File[]) {
    const file = files.find(isAcceptedAudioFile) ?? files[0]
    if (!file || loading) return
    setOneFileNote(files.length > 1)
    setState({ name: 'loading', fileName: file.name })
    try {
      const song = await createSongFromFile(file)
      setState({ name: 'empty' })
      onSongCreated(song)
    } catch (error) {
      if (!(error instanceof ImportError)) {
        setState({ name: 'empty' })
        throw error
      }
      setState({ name: 'error', message: error.message })
    }
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    // The browser opens a dropped file as a page unless the drop target cancels the event.
    event.preventDefault()
    if (!loading) setDragOver(true)
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    // A move onto a child element also fires dragleave on the drop zone.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return
    setDragOver(false)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    void addFiles([...event.dataTransfer.files])
  }

  const className = ['drop-zone', compact && 'compact', dragOver && 'drag-over']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="drop-zone-area">
      {state.name === 'error' && (
        <p className="message" role="alert">
          {state.message}
        </p>
      )}
      {oneFileNote && (
        <p className="note-band" role="status">
          Only one file was added.
        </p>
      )}
      <section
        className={className}
        aria-label="Drop zone"
        aria-busy={loading}
        data-state={dragOver ? 'drag-over' : state.name}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          aria-label="Audio file"
          accept={['audio/*', ...ACCEPTED_EXTENSIONS].join(',')}
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])]
            // A second selection of the same file must fire change again.
            event.currentTarget.value = ''
            void addFiles(files)
          }}
        />
        {loading ? (
          <div className="drop-zone-loading">
            <b>Decoding {state.fileName}</b>
            <progress aria-label={`Decoding ${state.fileName}`} />
          </div>
        ) : (
          <>
            <span className="drop-zone-note" aria-hidden="true">
              ♪
            </span>
            <div>
              <p className="drop-zone-title">
                {dragOver ? 'Drop to add' : 'Drop an audio file to add a song'}
              </p>
              <p className="drop-zone-hint">
                MP3, WAV, OGG, FLAC, M4A or AAC · 200 MB and 15 minutes at most · The audio stays in
                this browser.
              </p>
            </div>
            <div className="drop-zone-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => inputRef.current?.click()}
              >
                Add a song
              </button>
              {children}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
