import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { storeNewSong } from '../features/audio-import/storeNewSong.ts'
import { App } from './App.tsx'
import { LIBRARY_HASH, songHash } from './routes.ts'
import { applyStoredTheme } from './theme.ts'

/** Sets the colour scheme of the system that the matchMedia stub reports, and returns its change function. */
function stubSystemTheme(light: boolean): (nextLight: boolean) => void {
  const query = new EventTarget() as MediaQueryList
  const state = { matches: light }
  Object.defineProperty(query, 'matches', { get: () => state.matches })
  vi.stubGlobal('matchMedia', () => query)
  return (nextLight) => {
    state.matches = nextLight
    query.dispatchEvent(new Event('change'))
  }
}

/** jsdom has no Web Audio, so the stub decodes each file as 3 seconds of audio. */
function stubDecode(): () => void {
  const original: unknown = Reflect.get(globalThis, 'OfflineAudioContext')
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = () => Promise.resolve({ duration: 3 })
    },
  )
  return () => vi.stubGlobal('OfflineAudioContext', original)
}

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

  it('keeps the selected theme after a reload', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Theme: switch to light' }))
    first.unmount()
    delete document.documentElement.dataset.theme

    applyStoredTheme()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    render(<App />)

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Theme: switch to dark' })).toBeInTheDocument()
  })

  it('follows the theme of the system while no choice is stored', () => {
    const original = window.matchMedia
    const setSystemLight = stubSystemTheme(false)
    try {
      render(<App />)
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

      act(() => setSystemLight(true))

      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    } finally {
      vi.stubGlobal('matchMedia', original)
    }
  })

  it('keeps a stored choice when the theme of the system changes', () => {
    const original = window.matchMedia
    const setSystemLight = stubSystemTheme(true)
    localStorage.setItem('theme', 'dark')
    try {
      render(<App />)
      act(() => setSystemLight(false))
      act(() => setSystemLight(true))

      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    } finally {
      vi.stubGlobal('matchMedia', original)
    }
  })

  it('switches the theme when the browser refuses the storage, as in a private window', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The storage is not available.', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The storage is not available.', 'SecurityError')
    })
    try {
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Theme: switch to light' }))

      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('shows the song library with the message for the hash of a song that does not exist', async () => {
    window.location.hash = songHash('does-not-exist')
    try {
      render(<App />)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The app did not find this song. It is possible that the song was deleted.',
      )
      expect(screen.getByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    } finally {
      window.location.hash = ''
    }
  })

  it('shows the song library with no message for an unknown hash', async () => {
    window.location.hash = '#/bogus'
    try {
      render(<App />)
      expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
      await vi.waitFor(() => expect(window.location.hash).toBe(LIBRARY_HASH))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      window.location.hash = ''
    }
  })

  it('shows "Only one file was added." in the editor after the person drops two files', async () => {
    const restore = stubDecode()
    try {
      render(<App />)
      const dropZone = await screen.findByRole('region', { name: 'Drop zone' })
      const event = createEvent.drop(dropZone)
      const files = ['carol.mp3', 'noel.mp3'].map(
        (name) => new File([new Uint8Array([1])], name, { type: 'audio/mpeg' }),
      )
      Object.defineProperty(event, 'dataTransfer', { value: { files } })
      fireEvent(dropZone, event)

      expect(await screen.findByRole('heading', { level: 2, name: 'carol' })).toBeInTheDocument()
      expect(await screen.findByText('Only one file was added.')).toBeInTheDocument()
    } finally {
      restore()
      window.location.hash = ''
    }
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
    const original: unknown = Reflect.get(globalThis, 'OfflineAudioContext')
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = () => Promise.resolve({ duration: 3 })
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
      vi.stubGlobal('OfflineAudioContext', original)
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
