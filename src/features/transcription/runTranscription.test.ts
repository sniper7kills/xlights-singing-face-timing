import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../../store/songStore.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech } from './resample.ts'
import {
  NoWordsError,
  runTranscription,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { type TranscribeClient, TranscribeError } from './transcribeClient.ts'
import type { TimedWord } from './types.ts'

vi.mock('./resample.ts', () => ({ resampleForSpeech: vi.fn() }))

const audio = {
  data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

const WORDS: TimedWord[] = [
  { text: 'Silent', startMs: 100, endMs: 600 },
  { text: 'night,', startMs: 700, endMs: 1200 },
]

function fakeClient(words: TimedWord[] = WORDS): TranscribeClient {
  return {
    device: 'wasm',
    load: vi.fn(async (_id: string, onDownload?: (loaded: number, total: number) => void) => {
      onDownload?.(500_000, 1_000_000)
    }),
    transcribe: vi.fn(async (_samples, _offsetMs, handlers) => {
      handlers?.onProgress?.(20_000)
      return words
    }),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
}

function handlers(controller = new AbortController()): TranscribeRunHandlers {
  return {
    signal: controller.signal,
    onDownload: vi.fn(),
    onProgress: vi.fn(),
    onFinishing: vi.fn(),
    confirmReplace: vi.fn(async () => true),
    confirmLowMatch: vi.fn(async () => true),
  }
}

const modelRequest: TranscribeRequest = {
  voiceId: 'voice-1',
  speechModelId: 'whisper-base',
  mode: 'model',
}

beforeEach(async () => {
  // 30 seconds of audio at the speech model sample rate.
  vi.mocked(resampleForSpeech).mockResolvedValue(new Float32Array(30 * SPEECH_SAMPLE_RATE))
  const song = await storeNewSong({ name: 'carol', durationMs: 30_000, audio })
  await useSongStore.getState().openSong(song.id)
})

afterEach(() => {
  useSongStore.getState().closeSong()
})

describe('runTranscription with the speech model', () => {
  it('loads the speech model, transcribes the audio and returns the count of words', async () => {
    const client = fakeClient()
    const run = handlers()

    const outcome = await runTranscription(modelRequest, client, run)

    expect(outcome).toEqual({ wordCount: 2, estimatedCount: 0 })
    expect(client.load).toHaveBeenCalledWith('whisper-base', run.onDownload)
    expect(run.onDownload).toHaveBeenCalledWith(500_000, 1_000_000)
    expect(run.onProgress).toHaveBeenNthCalledWith(1, 0, 30_000)
    expect(run.onProgress).toHaveBeenNthCalledWith(2, 20_000, 30_000)
    expect(run.onFinishing).toHaveBeenCalledOnce()
  })

  it('reads the range and gives the start of the range as the song time of the first sample', async () => {
    const client = fakeClient()
    const range = { startMs: 10_000, endMs: 40_000 }

    await runTranscription({ ...modelRequest, range }, client, handlers())

    expect(resampleForSpeech).toHaveBeenCalledWith(expect.anything(), range)
    expect(client.transcribe).toHaveBeenCalledWith(
      expect.any(Float32Array),
      10_000,
      expect.anything(),
    )
  })

  it('changes no mark', async () => {
    const before = useSongStore.getState().current?.marks

    await runTranscription(modelRequest, fakeClient(), handlers())

    expect(useSongStore.getState().current?.marks).toEqual(before)
  })

  it('rejects with NoWordsError when the speech model returns no word', async () => {
    await expect(runTranscription(modelRequest, fakeClient([]), handlers())).rejects.toBeInstanceOf(
      NoWordsError,
    )
  })

  it('rejects as cancelled and loads no speech model when the signal aborts during the resample', async () => {
    const controller = new AbortController()
    vi.mocked(resampleForSpeech).mockImplementation(async () => {
      controller.abort()
      return new Float32Array(16)
    })
    const client = fakeClient()

    const result = runTranscription(modelRequest, client, handlers(controller))

    await expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    expect(client.load).not.toHaveBeenCalled()
  })

  it('passes a failure of the client to the dialog', async () => {
    const client = fakeClient()
    vi.mocked(client.load).mockRejectedValue(new TranscribeError('download', 'offline'))

    await expect(runTranscription(modelRequest, client, handlers())).rejects.toMatchObject({
      kind: 'download',
    })
  })

  it('rejects when no song is open', async () => {
    useSongStore.getState().closeSong()

    await expect(runTranscription(modelRequest, fakeClient(), handlers())).rejects.toThrow(
      'The open song has no audio file.',
    )
  })
})

describe('runTranscription with lyrics only', () => {
  it('returns the count of lyrics words with no speech model', async () => {
    const client = fakeClient()

    const outcome = await runTranscription(
      {
        ...modelRequest,
        mode: 'lyrics-only',
        lyrics: 'Silent night, holy night\n[Chorus]\nAll is calm',
      },
      client,
      handlers(),
    )

    expect(outcome).toEqual({ wordCount: 7, estimatedCount: 7 })
    expect(client.load).not.toHaveBeenCalled()
    expect(resampleForSpeech).not.toHaveBeenCalled()
  })

  it('rejects with NoWordsError for lyrics with no word', async () => {
    await expect(
      runTranscription({ ...modelRequest, mode: 'lyrics-only' }, fakeClient(), handlers()),
    ).rejects.toBeInstanceOf(NoWordsError)
  })
})
