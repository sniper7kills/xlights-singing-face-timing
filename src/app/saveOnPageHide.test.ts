import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAutosave, useAutosaveStore } from '../store/autosave.ts'
import * as db from '../store/db.ts'
import { loadSong, saveSong } from '../store/db.ts'
import { makeSongContent } from '../store/fixtures.test-helpers.ts'
import { useSongStore } from '../store/songStore.ts'
import { startSaveOnPageHide } from './saveOnPageHide.ts'

let stop: () => void

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  await saveSong(makeSongContent('song-1'))
  await useSongStore.getState().openSong('song-1')
  useAutosaveStore.setState({ saveState: 'saved', error: null })
  // The fake timer never fires, so each save in these tests comes from a page event.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const stopAutosave = startAutosave()
  const stopSaveOnPageHide = startSaveOnPageHide()
  stop = () => {
    stopSaveOnPageHide()
    stopAutosave()
  }
  useSongStore
    .getState()
    .apply((content) => ({ ...content, song: { ...content.song, name: 'Holy Night' } }))
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'visibilityState')
  useSongStore.getState().closeSong()
})

async function savedName() {
  await vi.waitFor(() => expect(useAutosaveStore.getState().saveState).toBe('saved'))
  return (await loadSong('song-1'))?.song.name
}

describe('startSaveOnPageHide', () => {
  it('saves a pending change at once when the page becomes hidden', async () => {
    setVisibility('hidden')

    expect(await savedName()).toBe('Holy Night')
  })

  it('saves a pending change at once when the page unloads', async () => {
    window.dispatchEvent(new Event('pagehide'))

    expect(await savedName()).toBe('Holy Night')
  })

  it('saves nothing when the page becomes visible', () => {
    const save = vi.spyOn(db, 'saveSong')

    setVisibility('visible')

    expect(save).not.toHaveBeenCalled()
  })

  it('saves nothing after the stop function runs', () => {
    const save = vi.spyOn(db, 'saveSong')
    stop()

    setVisibility('hidden')
    window.dispatchEvent(new Event('pagehide'))

    expect(save).not.toHaveBeenCalled()
  })
})
