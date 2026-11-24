import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { songHash } from '../../app/routes.ts'
import type { Song } from '../../store/types.ts'
import {
  formatChangeDate,
  formatDuration,
  MAX_SONG_NAME_LENGTH,
  normalizeSongName,
} from './libraryFormat.ts'

type SongListProps = {
  songs: Song[]
  /** Saves the new name of a song. The name is already trimmed and 1 to 80 characters. */
  onRename: (songId: string, name: string) => Promise<void>
  /** Deletes a song after the person confirms. */
  onDelete: (songId: string) => Promise<void>
}

/** Shows the saved songs, newest change first, with a link to the editor, a rename and a delete. */
export function SongList({ songs, onRename, onDelete }: SongListProps) {
  const now = new Date()
  // ISO 8601 times in UTC sort as strings.
  const ordered = [...songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <section className="song-list" aria-labelledby="song-list-title">
      <h3 id="song-list-title">Your songs</h3>
      <ul>
        {ordered.map((song) => (
          <SongRow key={song.id} song={song} now={now} onRename={onRename} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  )
}

type Mode = 'view' | 'rename' | 'delete'

type SongRowProps = Omit<SongListProps, 'songs'> & { song: Song; now: Date }

function SongRow({ song, now, onRename, onDelete }: SongRowProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [returnFocus, setReturnFocus] = useState<'rename' | 'delete' | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // The form or the dialog took the focus, so the focus goes back to the button that opened it.
    if (mode !== 'view' || returnFocus === null) return
    ;(returnFocus === 'rename' ? renameButton : deleteButton).current?.focus()
  }, [mode, returnFocus])

  function close(from: 'rename' | 'delete') {
    setReturnFocus(from)
    setMode('view')
  }

  if (mode === 'rename') {
    return (
      <li className="song">
        <RenameForm
          name={song.name}
          onSave={async (name) => {
            await onRename(song.id, name)
            close('rename')
          }}
          onCancel={() => close('rename')}
        />
      </li>
    )
  }
  if (mode === 'delete') {
    return (
      <li className="song">
        <DeleteConfirm
          name={song.name}
          onConfirm={() => onDelete(song.id)}
          onCancel={() => close('delete')}
        />
      </li>
    )
  }
  return (
    <li className="song">
      <a className="song-open" href={songHash(song.id)}>
        <span>
          <b>{song.name}</b>
          <small>{formatChangeDate(song.updatedAt, now)}</small>
        </span>
        <span className="song-duration">{formatDuration(song.durationMs)}</span>
      </a>
      <span className="song-actions">
        <button
          ref={renameButton}
          type="button"
          className="button"
          aria-label={`Rename ${song.name}`}
          onClick={() => setMode('rename')}
        >
          Rename
        </button>
        <button
          ref={deleteButton}
          type="button"
          className="button"
          aria-label={`Delete ${song.name}`}
          onClick={() => setMode('delete')}
        >
          Delete
        </button>
      </span>
    </li>
  )
}

function cancelOnEscape(onCancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Escape') onCancel()
  }
}

type RenameFormProps = {
  name: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}

function RenameForm({ name, onSave, onCancel }: RenameFormProps) {
  const [value, setValue] = useState(name)
  const inputId = useId()
  const normalized = normalizeSongName(value)
  return (
    <form
      className="song-form"
      onKeyDown={cancelOnEscape(onCancel)}
      onSubmit={(event) => {
        event.preventDefault()
        if (normalized !== null) void onSave(normalized)
      }}
    >
      <label htmlFor={inputId}>Song name</label>
      <input
        id={inputId}
        className="text-field"
        value={value}
        maxLength={MAX_SONG_NAME_LENGTH}
        autoFocus
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <button type="submit" className="button primary" disabled={normalized === null}>
        Save
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

type DeleteConfirmProps = {
  name: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function DeleteConfirm({ name, onConfirm, onCancel }: DeleteConfirmProps) {
  const titleId = useId()
  const textId = useId()
  return (
    <div
      className="song-confirm"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onKeyDown={cancelOnEscape(onCancel)}
    >
      <p id={titleId}>
        <b>Delete “{name}”?</b>
      </p>
      <p id={textId}>The app deletes its audio file, voices, sections and marks.</p>
      <span className="song-actions">
        <button type="button" className="button danger" onClick={() => void onConfirm()}>
          Delete
        </button>
        {/* The safe choice takes the focus, so a second Enter does not delete the song. */}
        <button type="button" className="button" autoFocus onClick={onCancel}>
          Cancel
        </button>
      </span>
    </div>
  )
}
