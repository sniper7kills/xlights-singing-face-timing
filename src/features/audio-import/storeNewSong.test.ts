import { describe, expect, it } from 'vitest'
import { getAudioFile, loadSong, putRecord } from '../../store/db.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from './storeNewSong.ts'

const audio = {
  data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
  fileName: 'silent-night.ogg',
  mimeType: 'audio/ogg',
}

describe('storeNewSong', () => {
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
    await putRecord('settings', {
      speechModelId: 'whisper-base',
      device: 'wasm',
      defaultFrameMs: 25,
      theme: 'dark',
    })

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
