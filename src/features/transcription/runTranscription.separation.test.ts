import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import { SeparateError, separateVocals } from '../vocal-separation/separateClient.ts'
import { decodeStereo, vocalsForSpeech } from '../vocal-separation/separationAudio.ts'
import { FakeXhr } from './fakeXhr.test-helpers.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech } from './resample.ts'
import {
  runTranscription,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { type TranscribeClient, TranscribeError } from './transcribeClient.ts'
import type { TimedWord } from './types.ts'

vi.mock('./resample.ts', () => ({ resampleForSpeech: vi.fn() }))
vi.mock('../vocal-separation/separateClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../vocal-separation/separateClient.ts')>()),
  separateVocals: vi.fn(),
}))
vi.mock('../vocal-separation/separationAudio.ts', () => ({
  decodeStereo: vi.fn(),
  vocalsForSpeech: vi.fn(),
}))
vi.mock('../phoneme-breakdown/loadDictionary.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../phoneme-breakdown/loadDictionary.ts')>()),
  loadDictionary: vi.fn(),
}))

const VOICE = 'voice-1'
const WORDS: TimedWord[] = [
  { text: ' Silent', startMs: 100, endMs: 600 },
  { text: ' night,', startMs: 700, endMs: 1200 },
]
const STEREO: StereoAudio = {
  left: new Float32Array(4),
  right: new Float32Array(4),
  sampleRate: 44100,
}
const VOCALS_44K = new Float32Array(3)
/** The vocals at 16 kHz: 20 seconds, so a test can tell them from the 30 seconds of the song audio. */
const VOCALS = new Float32Array(20 * SPEECH_SAMPLE_RATE)
const ORIGINAL = new Float32Array(30 * SPEECH_SAMPLE_RATE)

const separatedRequest: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
  separateVocals: true,
}

const steps: string[] = []

function fakeClient(): TranscribeClient {
  return {
    device: 'wasm',
    load: vi.fn(async () => {
      steps.push('load')
    }),
    transcribe: vi.fn(async () => {
      steps.push('transcribe')
      return WORDS
    }),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
}

function handlers(controller = new AbortController()): TranscribeRunHandlers {
  return {
    signal: controller.signal,
    onDownload: vi.fn(),
    onStage: vi.fn((stage) => steps.push(stage)),
    onProgress: vi.fn(),
    onFinishing: vi.fn(),
    confirmReplace: vi.fn(async () => true),
    confirmLowMatch: vi.fn(async () => true),
    onSeparationDownload: vi.fn(),
    onSeparationProgress: vi.fn(),
    confirmNoSeparation: vi.fn(async () => true),
  }
}

const marks = () => useSongStore.getState().current?.marks ?? []

function oldMark(id: string): Mark {
  return {
    id,
    voiceId: VOICE,
    layer: 'phrase',
    label: id,
    startMs: 1000,
    endMs: 2000,
    parentId: null,
    edited: false,
  }
}

async function openSong(existing: Mark[] = []) {
  const song = await storeNewSong({
    name: 'carol',
    durationMs: 30_000,
    audio: {
      data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
      fileName: 'carol.ogg',
      mimeType: 'audio/ogg',
    },
    voices: [{ id: VOICE, name: 'Lead Vocals', order: 0, color: '#e05d5d' }],
    marks: existing,
  })
  await useSongStore.getState().openSong(song.id)
}

beforeEach(async () => {
  steps.length = 0
  vi.mocked(resampleForSpeech).mockImplementation(async () => {
    steps.push('resample')
    return ORIGINAL
  })
  vi.mocked(decodeStereo).mockImplementation(async () => {
    steps.push('decode stereo')
    return STEREO
  })
  vi.mocked(separateVocals).mockImplementation(async (_audio, separateHandlers) => {
    steps.push('separate')
    separateHandlers?.onDownload?.(1, 2)
    separateHandlers?.onProgress?.(0, 1000)
    separateHandlers?.onProgress?.(1000, 1000)
    return VOCALS_44K
  })
  vi.mocked(vocalsForSpeech).mockImplementation(async () => {
    steps.push('resample vocals')
    return VOCALS
  })
  vi.mocked(loadDictionary).mockResolvedValue({ SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T' })
  await openSong()
})

afterEach(() => {
  useSongStore.getState().closeSong()
  vi.clearAllMocks()
})

describe('runTranscription with vocal separation', () => {
  it('separates the vocals before the speech model, and transcribes the vocals at 16 kHz', async () => {
    const client = fakeClient()
    const run = handlers()

    await runTranscription(separatedRequest, client, run)

    expect(steps).toEqual([
      'preparing',
      'decode stereo',
      'separation-download',
      'separate',
      'separating',
      'resample vocals',
      'loading',
      'load',
      'transcribe',
    ])
    expect(separateVocals).toHaveBeenCalledWith(STEREO, expect.anything())
    expect(vocalsForSpeech).toHaveBeenCalledWith(VOCALS_44K)
    expect(client.transcribe).toHaveBeenCalledWith(VOCALS, 0, expect.anything())
    expect(resampleForSpeech).not.toHaveBeenCalled()
    expect(run.onSeparationDownload).toHaveBeenCalledWith(1, 2)
    expect(run.onSeparationProgress).toHaveBeenLastCalledWith(1000, 1000)
    expect(marks().filter((mark) => mark.layer === 'word')).toHaveLength(2)
  })

  it('reports the step "separating" one time, at the first progress', async () => {
    const run = handlers()

    await runTranscription(separatedRequest, fakeClient(), run)

    expect(
      vi
        .mocked(run.onStage)
        .mock.calls.flat()
        .filter((s) => s === 'separating'),
    ).toEqual(['separating'])
  })

  it('makes no separation call when the option is off', async () => {
    const client = fakeClient()

    await runTranscription({ ...separatedRequest, separateVocals: false }, client, handlers())

    expect(decodeStereo).not.toHaveBeenCalled()
    expect(separateVocals).not.toHaveBeenCalled()
    expect(client.transcribe).toHaveBeenCalledWith(ORIGINAL, 0, expect.anything())
  })

  it('makes no separation call for a lyrics-only run', async () => {
    await runTranscription(
      { ...separatedRequest, mode: 'lyrics-only', lyrics: 'Silent night' },
      fakeClient(),
      handlers(),
    )

    expect(decodeStereo).not.toHaveBeenCalled()
    expect(separateVocals).not.toHaveBeenCalled()
  })

  it('cuts the range before the separation and adds the start of the range to each word time', async () => {
    const range = { startMs: 10_000, endMs: 20_000 }
    const client = fakeClient()

    await runTranscription({ ...separatedRequest, range }, client, handlers())

    expect(decodeStereo).toHaveBeenCalledWith(expect.anything(), range)
    expect(client.transcribe).toHaveBeenCalledWith(VOCALS, 10_000, expect.anything())
  })

  it('passes the cancel signal of the run to the separation', async () => {
    const controller = new AbortController()

    await runTranscription(separatedRequest, fakeClient(), handlers(controller))

    expect(vi.mocked(separateVocals).mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('asks the person after a failure, and transcribes the audio of the song for "Continue with no separation"', async () => {
    const failure = new SeparateError('memory', 'RangeError')
    vi.mocked(separateVocals).mockRejectedValue(failure)
    const client = fakeClient()
    const run = handlers()

    await runTranscription(separatedRequest, client, run)

    expect(run.confirmNoSeparation).toHaveBeenCalledExactlyOnceWith(failure, 'spleeter')
    expect(client.transcribe).toHaveBeenCalledWith(ORIGINAL, 0, expect.anything())
    expect(steps.slice(-5)).toEqual(['preparing', 'resample', 'loading', 'load', 'transcribe'])
    expect(marks().filter((mark) => mark.layer === 'word')).toHaveLength(2)
  })

  it('rejects as cancelled and changes no mark when the person selects "Cancel" after a failure', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('kept')])
    vi.mocked(separateVocals).mockRejectedValue(new SeparateError('download', 'TypeError'))
    const client = fakeClient()
    const run = handlers()
    vi.mocked(run.confirmNoSeparation).mockResolvedValue(false)

    const error: unknown = await runTranscription(separatedRequest, client, run).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(TranscribeError)
    expect(error).toMatchObject({ kind: 'cancelled' })
    expect(client.load).not.toHaveBeenCalled()
    expect(marks()).toEqual([oldMark('kept')])
  })

  it('rejects as cancelled, asks nothing and changes no mark when the person cancels during the step', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('kept')])
    const controller = new AbortController()
    vi.mocked(separateVocals).mockImplementation(async () => {
      controller.abort()
      throw new SeparateError('cancelled', 'The person cancelled the vocal separation.')
    })
    const client = fakeClient()
    const run = handlers(controller)

    await expect(runTranscription(separatedRequest, client, run)).rejects.toMatchObject({
      kind: 'cancelled',
    })

    expect(run.confirmNoSeparation).not.toHaveBeenCalled()
    expect(client.load).not.toHaveBeenCalled()
    expect(marks()).toEqual([oldMark('kept')])
  })

  it('rejects as cancelled when the person cancels after the separation ends', async () => {
    const controller = new AbortController()
    vi.mocked(separateVocals).mockImplementation(async () => {
      controller.abort()
      return VOCALS_44K
    })
    const run = handlers(controller)

    await expect(runTranscription(separatedRequest, fakeClient(), run)).rejects.toMatchObject({
      kind: 'cancelled',
    })
    expect(vocalsForSpeech).not.toHaveBeenCalled()
    expect(run.confirmNoSeparation).not.toHaveBeenCalled()
  })
})

describe('runTranscription with vocal separation and a remote endpoint', () => {
  const remote = { baseUrl: 'http://localhost:8000/v1', apiKey: '', model: 'whisper-1' }

  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    FakeXhr.responder = (xhr) =>
      xhr.respond(200, { words: [{ word: 'Silent', start: 0.1, end: 0.6 }] })
  })

  afterEach(() => {
    FakeXhr.reset()
    vi.unstubAllGlobals()
  })

  it('separates the vocals first and sends one WAV file of the vocals', async () => {
    const client = fakeClient()

    await runTranscription({ ...separatedRequest, remote }, client, handlers())

    expect(steps.slice(0, 6)).toEqual([
      'preparing',
      'decode stereo',
      'separation-download',
      'separate',
      'separating',
      'resample vocals',
    ])
    expect(steps[6]).toBe('sending')
    expect(FakeXhr.instances).toHaveLength(1)
    // A WAV file has a 44-byte header and 2 bytes for each sample.
    expect(FakeXhr.last().body?.get('file')).toMatchObject({ size: 44 + VOCALS.length * 2 })
    expect(client.load).not.toHaveBeenCalled()
  })

  it('passes the separation model of the request to the separation', async () => {
    await runTranscription(
      { ...separatedRequest, separationModel: 'demucs' },
      fakeClient(),
      handlers(),
    )

    expect(vi.mocked(separateVocals).mock.calls[0]?.[1]?.model).toBe('demucs')
  })

  it('separates with Spleeter when the request names no separation model', async () => {
    await runTranscription(separatedRequest, fakeClient(), handlers())

    expect(vi.mocked(separateVocals).mock.calls[0]?.[1]?.model).toBe('spleeter')
  })

  it('separates again with Spleeter for "Use the fast model" after a Demucs failure', async () => {
    const failure = new SeparateError('memory', 'std::bad_alloc')
    vi.mocked(separateVocals).mockRejectedValueOnce(failure)
    const client = fakeClient()
    const run = handlers()
    vi.mocked(run.confirmNoSeparation).mockResolvedValue('fast-model')

    await runTranscription({ ...separatedRequest, separationModel: 'demucs' }, client, run)

    expect(run.confirmNoSeparation).toHaveBeenCalledExactlyOnceWith(failure, 'demucs')
    expect(vi.mocked(separateVocals).mock.calls.map((call) => call[1]?.model)).toEqual([
      'demucs',
      'spleeter',
    ])
    expect(client.transcribe).toHaveBeenCalledWith(VOCALS, 0, expect.anything())
  })
})
