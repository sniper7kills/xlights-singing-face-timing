import { StorageFullError } from '../../store/db.ts'
import type { Song } from '../../store/types.ts'
import { storeNewSong } from './storeNewSong.ts'

/** The extensions of the audio files that the app accepts, in lower case. */
export const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']

// Decimal megabytes, so that a "201 MB" file is above the limit in both decimal and binary units.
const MAX_BYTES = 200_000_000
const MAX_DURATION_MS = 15 * 60 * 1000
const MAX_NAME_LENGTH = 80

/** The cause of a failed import. The shape comes from the module contract in the feature file. */
export type ImportFailure =
  | { kind: 'type' }
  | { kind: 'size'; bytes: number }
  | { kind: 'decode' }
  | { kind: 'duration'; ms: number }
  | { kind: 'storage' }

const MESSAGES: Record<ImportFailure['kind'], string> = {
  type: 'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
  size: 'This file is larger than 200 MB.',
  decode: 'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
  duration: 'This song is longer than 15 minutes.',
  storage: 'Browser storage is full. Delete a song and try again.',
}

/** The error that createSongFromFile rejects with. Its message is the text that the person sees. */
export class ImportError extends Error {
  readonly failure: ImportFailure

  constructor(failure: ImportFailure) {
    super(MESSAGES[failure.kind])
    this.name = 'ImportError'
    this.failure = failure
  }

  get kind(): ImportFailure['kind'] {
    return this.failure.kind
  }
}

/** Returns the duration of the decoded audio in seconds. Rejects if the browser cannot decode the bytes. */
export type DecodeAudio = (bytes: ArrayBuffer) => Promise<number>

/**
 * Returns the duration of the audio in seconds, decoded with Web Audio `decodeAudioData`.
 * Rejects if the browser cannot decode the bytes.
 */
export async function decodeWithWebAudio(bytes: ArrayBuffer): Promise<number> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(bytes)
    return buffer.duration
  } finally {
    // Browsers limit the number of open audio contexts.
    void context.close()
  }
}

/** Returns the extension of the file name in lower case, with the dot, or '' if it has none. */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? '' : fileName.slice(dot).toLowerCase()
}

/** Returns true if the app accepts the file as an audio file, from its extension and its MIME type. */
export function isAcceptedAudioFile(file: File): boolean {
  // An empty type means that the browser does not know the type, so the extension decides.
  // Some systems report an .ogg audio file as `video/ogg` or `application/ogg`.
  const typeAllowed =
    file.type === '' ||
    file.type.startsWith('audio/') ||
    file.type === 'video/ogg' ||
    file.type === 'application/ogg'
  return typeAllowed && ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))
}

/**
 * Returns the song name for a file: the file name without the extension, trimmed, 80 characters at most.
 * A name with only spaces gives the trimmed file name, because a song name has 1 character or more.
 */
export function songNameFromFileName(fileName: string): string {
  const name = fileName.slice(0, fileName.length - extensionOf(fileName).length).trim()
  return (name === '' ? fileName.trim() : name).slice(0, MAX_NAME_LENGTH)
}

async function decodeDurationMs(file: File, decode: DecodeAudio): Promise<number> {
  try {
    return Math.round((await decode(await file.arrayBuffer())) * 1000)
  } catch {
    // The decodeAudioData page lists no supported formats, so each rejection means "cannot decode".
    throw new ImportError({ kind: 'decode' })
  }
}

/**
 * Creates a song from an audio file and stores it with one "Lead Vocals" voice and the original bytes.
 * The song name is the file name without the extension.
 * @param file The audio file that the person selects or drops.
 * @param decode The decode step. Tests replace it so that they need no real audio.
 * Rejects with ImportError. Its `kind` is 'type', 'size', 'decode', 'duration' or 'storage'.
 * Nothing is stored after a rejection.
 */
export async function createSongFromFile(
  file: File,
  decode: DecodeAudio = decodeWithWebAudio,
): Promise<Song> {
  if (!isAcceptedAudioFile(file)) throw new ImportError({ kind: 'type' })
  if (file.size > MAX_BYTES) throw new ImportError({ kind: 'size', bytes: file.size })
  const durationMs = await decodeDurationMs(file, decode)
  if (durationMs > MAX_DURATION_MS) throw new ImportError({ kind: 'duration', ms: durationMs })
  try {
    return await storeNewSong({
      name: songNameFromFileName(file.name),
      durationMs,
      audio: { data: file, fileName: file.name, mimeType: file.type },
    })
  } catch (error) {
    throw error instanceof StorageFullError ? new ImportError({ kind: 'storage' }) : error
  }
}
