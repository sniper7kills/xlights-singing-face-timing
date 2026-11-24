import type { Mark, Song, Voice } from '../../store/types.ts'
import { storeNewSong } from './storeNewSong.ts'

const AUDIO_PATH = 'demo/silent-night.ogg'
const MARKS_PATH = 'demo/silent-night.marks.json'

// The marks file has no voice colour. This is the colour of "Lead Vocals" in the editor mockup.
const DEMO_VOICE_COLOR = '#ffb238'

/** The shape of public/demo/silent-night.marks.json. */
type DemoMarksFile = {
  song: { name: string; durationMs: number }
  voices: Omit<Voice, 'songId' | 'color'>[]
  marks: Mark[]
}

/** The demo files did not load. The message states the cause and the next action. */
export class DemoSongError extends Error {
  constructor(options?: ErrorOptions) {
    super('The demo song did not load. Check the connection and try again.', options)
    this.name = 'DemoSongError'
  }
}

async function fetchDemoFile(path: string): Promise<Response> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response
}

/**
 * Creates a normal song from the demo clip and its marks, and returns the stored song.
 * Each voice and each mark gets a new id, because the ids are keys in the whole database.
 * Rejects with DemoSongError when a demo file does not load.
 * Rejects with StorageFullError when the browser storage is full.
 */
export async function createDemoSong(): Promise<Song> {
  const [audio, demo] = await Promise.all([
    fetchDemoFile(AUDIO_PATH).then((response) => response.blob()),
    fetchDemoFile(MARKS_PATH).then((response) => response.json() as Promise<DemoMarksFile>),
  ]).catch((cause: unknown) => {
    throw new DemoSongError({ cause })
  })

  const ids = new Map<string, string>()
  function newId(fileId: string): string {
    const id = ids.get(fileId) ?? crypto.randomUUID()
    ids.set(fileId, id)
    return id
  }

  return storeNewSong({
    name: demo.song.name,
    durationMs: demo.song.durationMs,
    audio: { data: audio, fileName: 'silent-night.ogg', mimeType: 'audio/ogg' },
    voices: demo.voices.map((voice) => ({
      id: newId(voice.id),
      name: voice.name,
      order: voice.order,
      color: DEMO_VOICE_COLOR,
    })),
    marks: demo.marks.map((mark) => ({
      ...mark,
      id: newId(mark.id),
      voiceId: newId(mark.voiceId),
      parentId: mark.parentId === null ? null : newId(mark.parentId),
    })),
  })
}
