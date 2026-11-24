import { afterEach, describe, expect, it, vi } from 'vitest'
import marksFile from '../../../public/demo/silent-night.marks.json?raw'
import { getAudioFile, listRecords, listSongs, loadSong } from '../../store/db.ts'
import { createDemoSong, DemoSongError } from './createDemoSong.ts'

const audioBytes = new Uint8Array([1, 2, 3, 4])

/** Stubs fetch with the demo files. A path in `failing` answers with HTTP 404. */
function stubDemoFetch(failing: string[] = []) {
  vi.stubGlobal('fetch', (url: string) => {
    if (failing.some((path) => url.endsWith(path)))
      return Promise.resolve(new Response('', { status: 404 }))
    if (url === '/demo/silent-night.ogg')
      return Promise.resolve(new Response(audioBytes, { headers: { 'Content-Type': 'audio/ogg' } }))
    if (url === '/demo/silent-night.marks.json') return Promise.resolve(new Response(marksFile))
    return Promise.reject(new TypeError(`Unexpected URL ${url}`))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createDemoSong', () => {
  it('stores the demo song with one voice, 3 phrases, 16 words and 51 phonemes', async () => {
    stubDemoFetch()

    const song = await createDemoSong()

    expect(song).toMatchObject({ name: 'Silent Night', durationMs: 28900, frameMs: 50 })
    const content = await loadSong(song.id)
    expect(content?.voices).toEqual([
      { id: expect.any(String), songId: song.id, name: 'Lead Vocals', order: 0, color: '#ffb238' },
    ])
    const layers = content?.marks.map((mark) => mark.layer) ?? []
    expect(layers.filter((layer) => layer === 'phrase')).toHaveLength(3)
    expect(layers.filter((layer) => layer === 'word')).toHaveLength(16)
    expect(layers.filter((layer) => layer === 'phoneme')).toHaveLength(51)
    expect(await getAudioFile(song.id)).toMatchObject({
      fileName: 'silent-night.ogg',
      mimeType: 'audio/ogg',
      byteLength: 4,
    })
  })

  it('points every parentId and voiceId at a stored mark or voice of the song', async () => {
    stubDemoFetch()

    const song = await createDemoSong()

    const content = await loadSong(song.id)
    const marks = content?.marks ?? []
    const markLayers = new Map(marks.map((mark) => [mark.id, mark.layer]))
    const parentLayer = { phrase: undefined, word: 'phrase', phoneme: 'word' }
    for (const mark of marks) {
      expect(mark.voiceId).toBe(content?.voices[0]?.id)
      expect(mark.parentId === null ? undefined : markLayers.get(mark.parentId)).toBe(
        parentLayer[mark.layer],
      )
    }
  })

  it('creates two songs with no shared voice id or mark id when it runs two times', async () => {
    stubDemoFetch()

    const first = await createDemoSong()
    const second = await createDemoSong()

    expect(first.id).not.toBe(second.id)
    expect(await listSongs()).toHaveLength(2)
    const voices = await listRecords('voices')
    const marks = await listRecords('marks')
    expect(voices).toHaveLength(2)
    expect(marks).toHaveLength(2 * 70)
    expect(new Set(voices.map((voice) => voice.id)).size).toBe(2)
    expect(new Set(marks.map((mark) => mark.id)).size).toBe(2 * 70)
  })

  it.each(['silent-night.ogg', 'silent-night.marks.json'])(
    'rejects with the load message and stores nothing when %s answers 404',
    async (path) => {
      stubDemoFetch([path])

      const error = await createDemoSong().catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(DemoSongError)
      expect(error).toHaveProperty(
        'message',
        'The demo song did not load. Check the connection and retry.',
      )
      expect(await listSongs()).toEqual([])
    },
  )

  it('rejects with the load message when the network fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))

    await expect(createDemoSong()).rejects.toBeInstanceOf(DemoSongError)
  })
})
