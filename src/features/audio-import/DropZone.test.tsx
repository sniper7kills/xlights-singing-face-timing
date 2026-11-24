import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../../store/types.ts'
import { createSongFromFile, ImportError } from './createSongFromFile.ts'
import { DropZone } from './DropZone.tsx'

vi.mock('./createSongFromFile.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./createSongFromFile.ts')>()
  return { ...original, createSongFromFile: vi.fn() }
})

const createSong = vi.mocked(createSongFromFile)

const song: Song = {
  id: 'song-1',
  name: 'carol',
  durationMs: 3000,
  frameMs: 50,
  createdAt: '2026-11-24T10:00:00.000Z',
  updatedAt: '2026-11-24T10:00:00.000Z',
}

function file(name: string, type = 'audio/mpeg'): File {
  return new File([new Uint8Array([1])], name, { type })
}

function dropZone(): HTMLElement {
  return screen.getByRole('region', { name: 'Drop zone' })
}

function drop(files: File[]) {
  const event = createEvent.drop(dropZone())
  Object.defineProperty(event, 'dataTransfer', { value: { files } })
  fireEvent(dropZone(), event)
}

afterEach(() => {
  createSong.mockReset()
})

describe('DropZone', () => {
  it('shows the empty state with the "Add a song" button and the extra buttons', () => {
    render(
      <DropZone onSongCreated={vi.fn()}>
        <button type="button">Try the demo song</button>
      </DropZone>,
    )

    expect(dropZone()).toHaveAttribute('data-state', 'empty')
    expect(screen.getByText('Drop an audio file to add a song')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a song' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Try the demo song' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the file dialog when the person activates "Add a song" with the keyboard', async () => {
    const user = userEvent.setup()
    render(<DropZone onSongCreated={vi.fn()} />)
    const input = screen.getByLabelText<HTMLInputElement>('Audio file')
    const click = vi.spyOn(input, 'click')

    await user.tab()
    expect(screen.getByRole('button', { name: 'Add a song' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(click).toHaveBeenCalledOnce()
  })

  it('creates a song from a file in the file dialog and gives it to onSongCreated', async () => {
    const user = userEvent.setup()
    createSong.mockResolvedValue(song)
    const onSongCreated = vi.fn()
    render(<DropZone onSongCreated={onSongCreated} />)
    const carol = file('carol.mp3')

    await user.upload(screen.getByLabelText('Audio file'), carol)

    await vi.waitFor(() => expect(onSongCreated).toHaveBeenCalledWith(song))
    expect(createSong).toHaveBeenCalledExactlyOnceWith(carol)
  })

  it('creates a song from a dropped file', async () => {
    createSong.mockResolvedValue(song)
    const onSongCreated = vi.fn()
    render(<DropZone onSongCreated={onSongCreated} />)
    const carol = file('carol.mp3')

    drop([carol])

    await vi.waitFor(() => expect(onSongCreated).toHaveBeenCalledWith(song))
    expect(createSong).toHaveBeenCalledExactlyOnceWith(carol)
  })

  it('shows "Decoding <file name>" with a progress bar while the decode runs', async () => {
    createSong.mockReturnValue(new Promise(() => undefined))
    render(<DropZone onSongCreated={vi.fn()} />)

    drop([file('little-drummer-boy.flac', 'audio/flac')])

    expect(await screen.findByText('Decoding little-drummer-boy.flac')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Decoding little-drummer-boy.flac' }),
    ).toBeInTheDocument()
    expect(dropZone()).toHaveAttribute('data-state', 'loading')
    expect(dropZone()).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: 'Add a song' })).not.toBeInTheDocument()
  })

  it('shows "Drop to add" while a file is over the drop zone', () => {
    render(<DropZone onSongCreated={vi.fn()} />)

    fireEvent.dragEnter(dropZone())

    expect(dropZone()).toHaveAttribute('data-state', 'drag-over')
    expect(dropZone()).toHaveClass('drag-over')
    expect(screen.getByText('Drop to add')).toBeInTheDocument()

    fireEvent.dragLeave(dropZone())

    expect(dropZone()).toHaveAttribute('data-state', 'empty')
  })

  it('keeps the drag-over state when the file moves onto a child element', () => {
    render(<DropZone onSongCreated={vi.fn()} />)
    fireEvent.dragEnter(dropZone())

    // jsdom has no DragEvent, so the test sets relatedTarget on a plain event.
    const leave = createEvent.dragLeave(dropZone())
    Object.defineProperty(leave, 'relatedTarget', { value: screen.getByText('Drop to add') })
    fireEvent(dropZone(), leave)

    expect(dropZone()).toHaveAttribute('data-state', 'drag-over')
  })

  it.each([
    [
      { kind: 'type' } as const,
      'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
    ],
    [{ kind: 'size', bytes: 1 } as const, 'This file is larger than 200 MB.'],
    [
      { kind: 'decode' } as const,
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    ],
    [{ kind: 'duration', ms: 1 } as const, 'This song is longer than 15 minutes.'],
    [{ kind: 'storage' } as const, 'Browser storage is full. Delete a song and try again.'],
  ])('shows the error message for the failure %o', async (failure, message) => {
    createSong.mockRejectedValue(new ImportError(failure))
    const onSongCreated = vi.fn()
    render(<DropZone onSongCreated={onSongCreated} />)

    drop([file('carol.mp3')])

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(dropZone()).toHaveAttribute('data-state', 'error')
    expect(screen.getByRole('button', { name: 'Add a song' })).toBeEnabled()
    expect(onSongCreated).not.toHaveBeenCalled()
  })

  it('takes the first audio file of several dropped files and shows "Only one file was added."', async () => {
    createSong.mockResolvedValue(song)
    render(<DropZone onSongCreated={vi.fn()} />)
    const first = file('first.wav', 'audio/wav')

    drop([file('notes.txt', 'text/plain'), first, file('second.mp3')])

    expect(await screen.findByRole('status')).toHaveTextContent(/^Only one file was added\.$/)
    expect(createSong).toHaveBeenCalledExactlyOnceWith(first)
  })

  it('shows no note when one file is dropped', async () => {
    createSong.mockResolvedValue(song)
    const onSongCreated = vi.fn()
    render(<DropZone onSongCreated={onSongCreated} />)

    drop([file('carol.mp3')])

    await vi.waitFor(() => expect(onSongCreated).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('gives a dropped file that is not audio to the import, so that the type message shows', async () => {
    createSong.mockRejectedValue(new ImportError({ kind: 'type' }))
    render(<DropZone onSongCreated={vi.fn()} />)
    const text = file('lyrics.txt', 'text/plain')

    drop([text])

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(createSong).toHaveBeenCalledExactlyOnceWith(text)
  })

  it('shows the compact band when compact is set', () => {
    render(<DropZone onSongCreated={vi.fn()} compact />)
    expect(dropZone()).toHaveClass('compact')
  })
})
