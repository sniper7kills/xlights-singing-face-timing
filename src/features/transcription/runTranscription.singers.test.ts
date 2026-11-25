import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
import type { SingerSegment } from '../singer-voices/protocol.ts'
import { findSingers, SingersError } from '../singer-voices/singersClient.ts'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import { SeparateError, separateVocals } from '../vocal-separation/separateClient.ts'
import { decodeStereo, vocalsForSpeech } from '../vocal-separation/separationAudio.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech } from './resample.ts'
import {
  runTranscription,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import type { TranscribeClient } from './transcribeClient.ts'
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
vi.mock('../singer-voices/singersClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../singer-voices/singersClient.ts')>()),
  findSingers: vi.fn(),
}))
vi.mock('../phoneme-breakdown/loadDictionary.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../phoneme-breakdown/loadDictionary.ts')>()),
  loadDictionary: vi.fn(),
}))

const VOICE = 'voice-1'
/** Two phrases: the full stop ends the first one. */
const WORDS: TimedWord[] = [
  { text: ' Silent.', startMs: 100, endMs: 600 },
  { text: ' night', startMs: 2000, endMs: 2600 },
]
const STEREO: StereoAudio = {
  left: new Float32Array(4),
  right: new Float32Array(4),
  sampleRate: 44100,
}
const VOCALS = new Float32Array(20 * SPEECH_SAMPLE_RATE)
const ORIGINAL = new Float32Array(30 * SPEECH_SAMPLE_RATE)
/** Singer 0 sings the first phrase, and singer 1 the second phrase. */
const TWO_SINGERS: SingerSegment[] = [
  { startMs: 0, endMs: 1000, singer: 0 },
  { startMs: 1500, endMs: 3000, singer: 1 },
]

const request: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
  separateVocals: true,
  singerVoices: true,
}

const steps: string[] = []

function fakeClient(): TranscribeClient {
  return {
    device: 'wasm',
    load: vi.fn(async () => {
      steps.push('load')
    }),
    transcribe: vi.fn(async (_samples: Float32Array, offsetMs: number) => {
      steps.push('transcribe')
      return WORDS.map((word) => ({
        ...word,
        startMs: word.startMs + offsetMs,
        endMs: word.endMs + offsetMs,
      }))
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
    onSingersDownload: vi.fn(),
    onSingersProgress: vi.fn(),
  }
}

const content = () => {
  const current = useSongStore.getState().current
  if (current === null) throw new Error('No song is open.')
  return current
}
const phrasesOn = (voiceId: string): Mark[] =>
  content().marks.filter((mark) => mark.voiceId === voiceId && mark.layer === 'phrase')
const undoSteps = () => useSongStore.getState().history.past.length

async function openSong() {
  const song = await storeNewSong({
    name: 'carol',
    durationMs: 30_000,
    audio: {
      data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
      fileName: 'carol.ogg',
      mimeType: 'audio/ogg',
    },
    voices: [{ id: VOICE, name: 'Lead Vocals', order: 0, color: '#ffb238' }],
    marks: [],
  })
  await useSongStore.getState().openSong(song.id)
}

beforeEach(async () => {
  steps.length = 0
  vi.mocked(resampleForSpeech).mockResolvedValue(ORIGINAL)
  vi.mocked(decodeStereo).mockResolvedValue(STEREO)
  vi.mocked(separateVocals).mockResolvedValue(new Float32Array(3))
  vi.mocked(vocalsForSpeech).mockResolvedValue(VOCALS)
  vi.mocked(findSingers).mockImplementation(async (_vocals, singerHandlers) => {
    steps.push('find singers')
    singerHandlers?.onDownload?.(1, 2)
    singerHandlers?.onProgress?.(0, 1000)
    singerHandlers?.onProgress?.(1000, 1000)
    return TWO_SINGERS
  })
  vi.mocked(loadDictionary).mockResolvedValue({ SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T' })
  await openSong()
})

afterEach(() => {
  useSongStore.getState().closeSong()
  vi.clearAllMocks()
})

describe('runTranscription with singer voices', () => {
  it('finds the singers in the separated vocals after the marks, and reports both steps one time', async () => {
    const run = handlers()

    const outcome = await runTranscription(request, fakeClient(), run)

    expect(steps.slice(-4)).toEqual([
      'transcribe',
      'singers-download',
      'find singers',
      'finding-singers',
    ])
    expect(findSingers).toHaveBeenCalledWith(VOCALS, expect.anything())
    expect(vi.mocked(findSingers).mock.calls[0]?.[1]?.signal).toBe(run.signal)
    expect(run.onSingersDownload).toHaveBeenCalledWith(1, 2)
    expect(run.onSingersProgress).toHaveBeenLastCalledWith(1000, 1000)
    expect(separateVocals).toHaveBeenCalledTimes(1)
    expect(outcome.singers).toEqual({ status: 'split', voiceCount: 2, voiceName: 'Lead Vocals' })
  })

  it('puts the second singer on "Singer 2" as a separate undo step after the marks', async () => {
    await runTranscription(request, fakeClient(), handlers())

    const singer = content().voices.find((voice) => voice.name === 'Singer 2')
    expect(singer).toBeDefined()
    expect(phrasesOn(VOICE).map((phrase) => phrase.label)).toEqual(['Silent.'])
    expect(phrasesOn(singer?.id ?? '').map((phrase) => phrase.label)).toEqual(['night'])
    expect(undoSteps()).toBe(2)

    useSongStore.getState().undo()

    expect(content().voices).toHaveLength(1)
    expect(phrasesOn(VOICE)).toHaveLength(2)
    expect(content().marks.filter((mark) => mark.layer === 'word')).toHaveLength(2)
  })

  it('keeps the sections of the lyrics tags as their own undo step between the marks and the singers', async () => {
    await runTranscription(
      { ...request, lyrics: '[Verse]\nSilent\nnight', addSections: true },
      fakeClient(),
      handlers(),
    )

    expect(undoSteps()).toBe(3)
    useSongStore.getState().undo()
    expect(content().voices).toHaveLength(1)
    expect(content().sections).toHaveLength(1)
  })

  it('adds the start of a range run to each singer time', async () => {
    const range = { startMs: 10_000, endMs: 20_000 }

    await runTranscription({ ...request, range }, fakeClient(), handlers())

    const singer = content().voices.find((voice) => voice.name === 'Singer 2')
    expect(phrasesOn(singer?.id ?? '')).toMatchObject([{ startMs: 12_000 }])
  })

  it('makes no singer call when the option is off', async () => {
    const outcome = await runTranscription(
      { ...request, singerVoices: false },
      fakeClient(),
      handlers(),
    )

    expect(findSingers).not.toHaveBeenCalled()
    expect(outcome.singers).toBeUndefined()
    expect(content().voices).toHaveLength(1)
  })

  it('makes no singer call without the vocal separation', async () => {
    const outcome = await runTranscription(
      { ...request, separateVocals: false },
      fakeClient(),
      handlers(),
    )

    expect(findSingers).not.toHaveBeenCalled()
    expect(outcome.singers).toBeUndefined()
  })

  it('reports no separated vocals after "Continue with no separation", and keeps the marks', async () => {
    vi.mocked(separateVocals).mockRejectedValue(new SeparateError('model', 'detail'))

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(findSingers).not.toHaveBeenCalled()
    expect(outcome.singers).toEqual({ status: 'no-vocals', voiceName: 'Lead Vocals' })
    expect(phrasesOn(VOICE)).toHaveLength(2)
  })

  it('keeps the marks on the voice when the person cancels during the step', async () => {
    const controller = new AbortController()
    vi.mocked(findSingers).mockImplementation(async () => {
      controller.abort()
      throw new SingersError('cancelled', 'The person cancelled the singer search.')
    })

    const outcome = await runTranscription(request, fakeClient(), handlers(controller))

    expect(outcome.singers).toEqual({ status: 'cancelled', voiceName: 'Lead Vocals' })
    expect(phrasesOn(VOICE)).toHaveLength(2)
    expect(content().voices).toHaveLength(1)
    expect(undoSteps()).toBe(1)
  })

  it.each(['download', 'memory', 'model', 'unknown'] as const)(
    'keeps the marks on the voice and reports the failure %s',
    async (kind) => {
      vi.mocked(findSingers).mockRejectedValue(new SingersError(kind, 'detail'))

      const outcome = await runTranscription(request, fakeClient(), handlers())

      expect(outcome.singers).toEqual({ status: 'failed', kind, voiceName: 'Lead Vocals' })
      expect(phrasesOn(VOICE)).toHaveLength(2)
      expect(undoSteps()).toBe(1)
    },
  )

  it('reports the failure unknown for an error that is not a SingersError', async () => {
    vi.mocked(findSingers).mockRejectedValue(new TypeError('boom'))

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(outcome.singers).toMatchObject({ status: 'failed', kind: 'unknown' })
  })

  it('reports one voice and adds no voice when the vocals have one singer', async () => {
    vi.mocked(findSingers).mockResolvedValue([{ startMs: 0, endMs: 30_000, singer: 0 }])

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(outcome.singers).toEqual({ status: 'split', voiceCount: 1, voiceName: 'Lead Vocals' })
    expect(content().voices).toHaveLength(1)
    expect(undoSteps()).toBe(1)
  })
})
