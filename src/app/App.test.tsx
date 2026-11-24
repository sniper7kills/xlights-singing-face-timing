import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { storeNewSong } from '../features/audio-import/storeNewSong.ts'
import { App } from './App.tsx'
import { LIBRARY_HASH, songHash } from './routes.ts'

const audio = {
  data: new Blob([new Uint8Array([1])]),
  fileName: 'carol.mp3',
  mimeType: 'audio/mpeg',
}

describe('App', () => {
  it('shows the app name in the header', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Singing Face Timing')
  })

  it('switches the theme on the html element when the person uses the theme switch', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    await user.click(screen.getByRole('button', { name: 'Theme: switch to light' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Theme: switch to dark' })).toBeInTheDocument()
  })

  it('shows the song name in the editor for the hash of a saved song', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    window.location.hash = songHash(song.id)
    try {
      render(<App />)
      expect(await screen.findByRole('heading', { level: 2, name: 'carol' })).toBeInTheDocument()
    } finally {
      window.location.hash = ''
    }
  })

  it('goes back to the song library for the hash of a song that does not exist', async () => {
    window.location.hash = songHash('missing')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(window.location.hash).toBe(LIBRARY_HASH)
  })

  it('opens the editor of the new song after the person adds an audio file', async () => {
    const user = userEvent.setup()
    // jsdom has no Web Audio, so the stub decodes each file as 3 seconds of audio.
    const original: unknown = Reflect.get(globalThis, 'AudioContext')
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = () => Promise.resolve({ duration: 3 })
        close = () => Promise.resolve()
      },
    )
    try {
      render(<App />)
      await user.upload(
        await screen.findByLabelText('Audio file'),
        new File([new Uint8Array([1])], 'carol.mp3', { type: 'audio/mpeg' }),
      )
      expect(await screen.findByRole('heading', { level: 2, name: 'carol' })).toBeInTheDocument()
      expect(window.location.hash).toMatch(/^#\/song\/[0-9a-f-]+$/)
    } finally {
      vi.stubGlobal('AudioContext', original)
      window.location.hash = ''
    }
  })

  it('shows the empty song library when the database opens', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a song' })).toBeEnabled()
  })

  it('shows the storage message when the browser has no IndexedDB', async () => {
    // The setup file also stubs matchMedia, so this test puts back only its own global.
    const original = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    try {
      render(<App />)
      await screen.findByRole('alert')
      expect(screen.getByRole('main')).toHaveTextContent(
        /^This browser cannot store songs\. Use a current Chrome, Edge or Firefox\.$/,
      )
    } finally {
      vi.stubGlobal('indexedDB', original)
    }
  })
})
