import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAudioFile, listSongs, loadSong, openDatabase } from '../../store/db.ts'
import {
  createSongFromFile,
  ImportError,
  isAcceptedAudioFile,
  songNameFromFileName,
} from './createSongFromFile.ts'

function audioFile(name: string, type = 'audio/mpeg', size?: number): File {
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

const decodes = (seconds: number) => () => Promise.resolve(seconds)

async function rejectionOf(promise: Promise<unknown>): Promise<ImportError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ImportError))
    throw new Error(`Expected an ImportError, got ${String(error)}`)
  return error
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSongFromFile', () => {
  it('creates the song "carol" with one voice "Lead Vocals" from carol.mp3', async () => {
    const song = await createSongFromFile(audioFile('carol.mp3'), decodes(28.9))

    expect(song.name).toBe('carol')
    expect(song.durationMs).toBe(28900)
    expect(song.frameMs).toBe(50)
    const content = await loadSong(song.id)
    expect(content?.voices.map((voice) => voice.name)).toEqual(['Lead Vocals'])
    expect(content?.marks).toEqual([])
  })

  it('stores the original bytes, the file name and the MIME type of the audio file', async () => {
    const file = audioFile('carol.mp3')
    const song = await createSongFromFile(file, decodes(3))

    const stored = await getAudioFile(song.id)
    expect(stored).toMatchObject({ songId: song.id, fileName: 'carol.mp3', mimeType: 'audio/mpeg' })
    expect(stored?.byteLength).toBe(4)
  })

  it('gives the decode step the bytes of the file', async () => {
    const decode = vi.fn((bytes: ArrayBuffer) => Promise.resolve(bytes.byteLength))
    await createSongFromFile(audioFile('carol.mp3'), decode)

    expect(decode).toHaveBeenCalledOnce()
    expect(decode.mock.calls[0]?.[0].byteLength).toBe(4)
  })

  it('rejects a .txt file with the file-type message and creates no song', async () => {
    const decode = vi.fn(decodes(1))
    const error = await rejectionOf(
      createSongFromFile(audioFile('lyrics.txt', 'text/plain'), decode),
    )

    expect(error.failure).toEqual({ kind: 'type' })
    expect(error.message).toBe(
      'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
    )
    expect(decode).not.toHaveBeenCalled()
    expect(await listSongs()).toEqual([])
  })

  it('rejects an accepted extension with a MIME type that is not audio', async () => {
    const error = await rejectionOf(
      createSongFromFile(audioFile('clip.mp3', 'video/mp4'), decodes(1)),
    )
    expect(error.kind).toBe('type')
  })

  it('rejects an .mp3 file with the MIME type text/plain with the file-type message', async () => {
    const decode = vi.fn(decodes(1))
    const error = await rejectionOf(
      createSongFromFile(audioFile('carol.mp3', 'text/plain'), decode),
    )

    expect(error.failure).toEqual({ kind: 'type' })
    expect(error.message).toBe(
      'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
    )
    expect(decode).not.toHaveBeenCalled()
  })

  it('creates a song from an .ogg file with the MIME type video/ogg', async () => {
    const song = await createSongFromFile(audioFile('carol.ogg', 'video/ogg'), decodes(3))
    expect(song.name).toBe('carol')
  })

  it('rejects a 201 MB file with the size message and creates no song', async () => {
    const bytes = 201 * 1024 * 1024
    const error = await rejectionOf(
      createSongFromFile(audioFile('big.wav', 'audio/wav', bytes), decodes(1)),
    )

    expect(error.failure).toEqual({ kind: 'size', bytes })
    expect(error.message).toBe('This file is larger than 200 MB.')
    expect(await listSongs()).toEqual([])
  })

  it('accepts a file of exactly 200 MB', async () => {
    const song = await createSongFromFile(
      audioFile('max.wav', 'audio/wav', 200_000_000),
      decodes(1),
    )
    expect(song.name).toBe('max')
  })

  it('rejects a file that the browser cannot decode with the decode message', async () => {
    const error = await rejectionOf(
      createSongFromFile(audioFile('broken.flac', 'audio/flac'), () =>
        Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError')),
      ),
    )

    expect(error.failure).toEqual({ kind: 'decode' })
    expect(error.message).toBe(
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    )
    expect(await listSongs()).toEqual([])
  })

  it('rejects a 16-minute file with the duration message and creates no song', async () => {
    const error = await rejectionOf(
      createSongFromFile(audioFile('long.ogg', 'audio/ogg'), decodes(960)),
    )

    expect(error.failure).toEqual({ kind: 'duration', ms: 960_000 })
    expect(error.message).toBe('This song is longer than 15 minutes.')
    expect(await listSongs()).toEqual([])
  })

  it('accepts a file of exactly 15 minutes', async () => {
    const song = await createSongFromFile(audioFile('exact.ogg', 'audio/ogg'), decodes(900))
    expect(song.durationMs).toBe(900_000)
  })

  it('rejects with the storage message and stores nothing when the browser storage is full', async () => {
    await openDatabase()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
    })

    const error = await rejectionOf(createSongFromFile(audioFile('carol.mp3'), decodes(3)))

    expect(error.failure).toEqual({ kind: 'storage' })
    expect(error.message).toBe('Browser storage is full. Delete a song and try again.')
    vi.restoreAllMocks()
    expect(await listSongs()).toEqual([])
  })

  it('rejects with the original error for a storage failure that is not a full storage', async () => {
    await openDatabase()
    const failure = new Error('The disk is gone.')
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw failure
    })

    await expect(createSongFromFile(audioFile('carol.mp3'), decodes(3))).rejects.toBe(failure)
  })
})

describe('isAcceptedAudioFile', () => {
  it.each(['a.mp3', 'a.wav', 'a.ogg', 'a.flac', 'a.m4a', 'a.aac', 'A.MP3'])(
    'accepts %s with an audio MIME type',
    (name) => {
      expect(isAcceptedAudioFile(audioFile(name, 'audio/x-test'))).toBe(true)
    },
  )

  it('accepts an accepted extension when the browser reports no MIME type', () => {
    expect(isAcceptedAudioFile(audioFile('a.flac', ''))).toBe(true)
  })

  it('accepts an .ogg file with the MIME type video/ogg', () => {
    expect(isAcceptedAudioFile(audioFile('carol.ogg', 'video/ogg'))).toBe(true)
  })

  it('accepts an .ogg file with the MIME type application/ogg', () => {
    expect(isAcceptedAudioFile(audioFile('carol.ogg', 'application/ogg'))).toBe(true)
  })

  it('accepts an .mp3 file with an empty MIME type', () => {
    expect(isAcceptedAudioFile(audioFile('carol.mp3', ''))).toBe(true)
  })

  it('rejects a .txt file with the MIME type audio/mpeg', () => {
    expect(isAcceptedAudioFile(audioFile('lyrics.txt', 'audio/mpeg'))).toBe(false)
  })

  it.each(['a.txt', 'a.mp4', 'mp3', '.mp3'])('rejects %s', (name) => {
    expect(isAcceptedAudioFile(audioFile(name, ''))).toBe(false)
  })
})

describe('songNameFromFileName', () => {
  it('removes only the last extension', () => {
    expect(songNameFromFileName('o.holy.night.wav')).toBe('o.holy.night')
  })

  it('trims spaces at both ends of the name', () => {
    expect(songNameFromFileName('  carol .mp3')).toBe('carol')
  })

  it('keeps 80 characters at most', () => {
    expect(songNameFromFileName(`${'a'.repeat(100)}.mp3`)).toBe('a'.repeat(80))
  })

  it('uses the file name when the name without the extension has only spaces', () => {
    expect(songNameFromFileName('  .mp3')).toBe('.mp3')
  })
})
