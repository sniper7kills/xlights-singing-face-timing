import { afterEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../store/db.ts'
import { getAudioFile, loadSong, putRecord } from '../../store/db.ts'
import { DEFAULT_SETTINGS } from '../../store/settings.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from './storeNewSong.ts'
import { removeStorageStub, stubStorage } from './storageStub.test-helpers.ts'

const audio = {
  data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
  fileName: 'silent-night.ogg',
  mimeType: 'audio/ogg',
}

afterEach(() => {
  removeStorageStub()
  vi.restoreAllMocks()
})

describe('storeNewSong', () => {
  it('requests persistent storage one time for the first song only', async () => {
    const storage = stubStorage()

    await storeNewSong({ name: 'carol', durationMs: 1000, audio })
    await vi.waitFor(() => expect(storage.persist).toHaveBeenCalledTimes(1))
    await storeNewSong({ name: 'noel', durationMs: 1000, audio })
    // The request runs after the save without a wait, so the test gives it time to finish.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(storage.persist).toHaveBeenCalledTimes(1)
  })

  it('stores the song when the persistent storage request fails', async () => {
    // The tests run in Node, and the app tsconfig has no Node types.
    const { process } = globalThis as unknown as {
      process: Record<'on' | 'off', (event: string, listener: () => void) => void>
    }
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)
    try {
      vi.spyOn(db, 'listSongs').mockRejectedValue(new Error('The disk is gone.'))

      const song = await storeNewSong({ name: 'carol', durationMs: 1000, audio })
      // Node reports a rejection without a handler after the microtasks end.
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect((await loadSong(song.id))?.song.name).toBe('carol')
      expect(onUnhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('stores a song with one "Lead Vocals" voice, no marks and the audio file', async () => {
    const song = await storeNewSong({ name: 'silent-night', durationMs: 28900, audio })

    const content = await loadSong(song.id)
    expect(content?.song).toEqual(song)
    expect(content?.voices).toEqual([
      expect.objectContaining({ songId: song.id, name: 'Lead Vocals', order: 0 }),
    ])
    expect(content?.sections).toEqual([])
    expect(content?.marks).toEqual([])
    expect(await getAudioFile(song.id)).toMatchObject({
      songId: song.id,
      fileName: 'silent-night.ogg',
      mimeType: 'audio/ogg',
      byteLength: 3,
    })
  })

  it('sets createdAt and updatedAt to the time of the save', async () => {
    const before = new Date().toISOString()
    const song = await storeNewSong({ name: 'a', durationMs: 1, audio })

    expect(song.createdAt >= before).toBe(true)
    expect(song.updatedAt >= song.createdAt).toBe(true)
  })

  it('reads frameMs from the default frame size in the app settings', async () => {
    await putRecord('settings', { ...DEFAULT_SETTINGS, defaultFrameMs: 25 })

    const song = await storeNewSong({ name: 'a', durationMs: 1, audio })

    expect(song.frameMs).toBe(25)
  })

  it('stores the given voices and marks instead of the default voice', async () => {
    const mark: Mark = {
      id: 'demo-phrase-1',
      voiceId: 'demo-voice',
      layer: 'phrase',
      label: 'Silent night',
      startMs: 100,
      endMs: 2000,
      parentId: null,
      edited: false,
    }

    const song = await storeNewSong({
      name: 'silent-night',
      durationMs: 28900,
      audio,
      voices: [{ id: 'demo-voice', name: 'Lead Vocals', order: 0, color: '#4cc9f0' }],
      marks: [mark],
    })

    const content = await loadSong(song.id)
    expect(content?.voices).toEqual([
      { id: 'demo-voice', songId: song.id, name: 'Lead Vocals', order: 0, color: '#4cc9f0' },
    ])
    expect(content?.marks).toEqual([mark])
  })
})
