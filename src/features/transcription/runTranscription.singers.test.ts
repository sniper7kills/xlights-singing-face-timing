import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { addMark } from '../../store/actions/addMark.ts'
import { addVoice, deleteVoice, renameVoice } from '../../store/actions/voices.ts'
import { loadRunData } from '../../store/db.ts'
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
    confirmLyricsFit: vi.fn(async () => true),
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
  vi.mocked(separateVocals).mockResolvedValue({ vocals: new Float32Array(3) })
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

  it('gives the count of singers of the request to the singer search', async () => {
    await runTranscription({ ...request, singerCount: 3 }, fakeClient(), handlers())

    expect(vi.mocked(findSingers).mock.calls[0]?.[1]?.singerCount).toBe(3)
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

  it('finds the singers in the Spleeter vocals after a Demucs memory failure and "Use the fast model"', async () => {
    const spleeterStems = new Float32Array(5)
    const spleeterVocals = new Float32Array(10 * SPEECH_SAMPLE_RATE)
    vi.mocked(separateVocals)
      .mockRejectedValueOnce(new SeparateError('memory', 'std::bad_alloc'))
      .mockResolvedValueOnce({ vocals: spleeterStems })
    vi.mocked(vocalsForSpeech).mockImplementation(async (stems) =>
      stems === spleeterStems ? spleeterVocals : VOCALS,
    )
    const run = handlers()
    vi.mocked(run.confirmNoSeparation).mockResolvedValue('fast-model')

    const outcome = await runTranscription(
      { ...request, separationModel: 'demucs' },
      fakeClient(),
      run,
    )

    expect(run.confirmNoSeparation).toHaveBeenCalledWith(expect.any(SeparateError), 'demucs')
    expect(vi.mocked(separateVocals).mock.calls.map((call) => call[1]?.model)).toEqual([
      'demucs',
      'spleeter',
    ])
    expect(findSingers).toHaveBeenCalledWith(spleeterVocals, expect.anything())
    expect(outcome.singers).toEqual({ status: 'split', voiceCount: 2, voiceName: 'Lead Vocals' })
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

  describe('with fewer free voices than singers', () => {
    const fillVoices = (count: number) => {
      while (content().voices.length < count) addVoice(content().song.id)
    }

    it('reports the outcome capped and adds no voice when the song has 12 voices', async () => {
      fillVoices(MAX_VOICES)

      const outcome = await runTranscription(request, fakeClient(), handlers())

      expect(outcome.singers).toEqual({ status: 'capped', voiceCount: 1, voiceName: 'Lead Vocals' })
      expect(content().voices).toHaveLength(MAX_VOICES)
      expect(phrasesOn(VOICE)).toHaveLength(2)
    })

    it('reports the outcome capped when the song has room for some singers only', async () => {
      fillVoices(MAX_VOICES - 1)
      // Singers 1 and 2 both sing the second phrase, so the run finds three singers.
      vi.mocked(findSingers).mockResolvedValue([
        ...TWO_SINGERS,
        { startMs: 1500, endMs: 3000, singer: 2 },
      ])

      const outcome = await runTranscription(request, fakeClient(), handlers())

      expect(outcome.singers).toEqual({ status: 'capped', voiceCount: 2, voiceName: 'Lead Vocals' })
      expect(content().voices).toHaveLength(MAX_VOICES)
    })
  })
})

describe('runTranscription after a run with singer voices', () => {
  const voiceNamed = (name: string) => {
    const voice = content().voices.find((item) => item.name === name)
    if (voice === undefined) throw new Error(`No voice ${name}.`)
    return voice
  }
  const phraseLabels = () =>
    content()
      .marks.filter((mark) => mark.layer === 'phrase')
      .map((mark) => mark.label)
      .sort()

  it('stores the id of each voice of the run with its singers, and the voice id of each report row', async () => {
    await runTranscription(request, fakeClient(), handlers())

    const singer = voiceNamed('Singer 2')
    const data = await loadRunData(content().song.id)
    expect(data?.voices).toEqual([
      { voiceId: VOICE, singers: [0], made: false },
      { voiceId: singer.id, singers: [1], made: true },
    ])
    expect(data?.report.voices.map((voice) => voice.voiceId)).toEqual([VOICE, singer.id])
  })

  it('stores the voice of a run with no singer step, with no singer', async () => {
    await runTranscription({ ...request, singerVoices: false }, fakeClient(), handlers())

    const data = await loadRunData(content().song.id)
    expect(data?.voices).toEqual([{ voiceId: VOICE, singers: [], made: false }])
  })

  it('replaces the marks of the singer voices of the last run, so no phrase is on two voices', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const firstSinger = voiceNamed('Singer 2')
    const markCount = content().marks.length
    const run = handlers()

    await runTranscription(request, fakeClient(), run)

    expect(run.confirmReplace).toHaveBeenCalledWith({
      markCount,
      voiceName: 'Lead Vocals',
      range: { startMs: 0, endMs: 30_000 },
      singerVoiceNames: ['Singer 2'],
      singerVoicesKept: false,
    })
    expect(content().voices.map((voice) => voice.name)).toEqual(['Lead Vocals', 'Singer 2'])
    // The emptied voice goes, so the new "Singer 2" is a new voice with the same name and colour.
    expect(voiceNamed('Singer 2').id).not.toBe(firstSinger.id)
    expect(voiceNamed('Singer 2').color).toBe(firstSinger.color)
    expect(phraseLabels()).toEqual(['Silent.', 'night'])
  })

  it('replaces a renamed singer voice of the last run too', async () => {
    await runTranscription(request, fakeClient(), handlers())
    renameVoice(voiceNamed('Singer 2').id, 'Test Alto')
    const run = handlers()

    await runTranscription(request, fakeClient(), run)

    expect(vi.mocked(run.confirmReplace).mock.calls[0]?.[0].singerVoiceNames).toEqual(['Test Alto'])
    expect(content().voices.map((voice) => voice.name)).toEqual(['Lead Vocals', 'Singer 2'])
    expect(phraseLabels()).toEqual(['Silent.', 'night'])
  })

  it('keeps a singer voice with marks outside the range, and the new singer voice gets the next free name', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const firstSinger = voiceNamed('Singer 2')
    addMark(firstSinger.id, 'phrase', 20_000, 21_000, 'kept')

    await runTranscription(
      { ...request, range: { startMs: 0, endMs: 10_000 } },
      fakeClient(),
      handlers(),
    )

    expect(content().voices.map((voice) => voice.name)).toEqual([
      'Lead Vocals',
      'Singer 2',
      'Singer 3',
    ])
    expect(phrasesOn(firstSinger.id).map((phrase) => phrase.label)).toEqual(['kept'])
    expect(phrasesOn(voiceNamed('Singer 3').id).map((phrase) => phrase.label)).toEqual(['night'])
  })

  it('restores the result of the first run exactly with the undo steps of the second run', async () => {
    await runTranscription(request, fakeClient(), handlers())
    setPreviewMutedOnSinger()
    const first = structuredClone(content())
    const stepsBefore = undoSteps()

    await runTranscription(
      { ...request, lyrics: '[Verse]\nSilent\nnight', addSections: true },
      fakeClient(),
      handlers(),
    )

    // The steps are the singer step, the sections of the tags, and the marks with the replace.
    expect(undoSteps() - stepsBefore).toBe(3)
    for (let step = 0; step < 3; step += 1) useSongStore.getState().undo()
    expect(content()).toStrictEqual(first)
  })

  it('leaves the singer voices of the last run as they are for a run with the singer option off', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const singer = structuredClone(voiceNamed('Singer 2'))
    const singerMarks = structuredClone(
      content().marks.filter((mark) => mark.voiceId === singer.id),
    )
    const run = handlers()

    await runTranscription({ ...request, singerVoices: false }, fakeClient(), run)

    expect(vi.mocked(run.confirmReplace).mock.calls[0]?.[0]).toMatchObject({
      singerVoiceNames: [],
      singerVoicesKept: true,
    })
    expect(voiceNamed('Singer 2')).toEqual(singer)
    expect(content().marks.filter((mark) => mark.voiceId === singer.id)).toEqual(singerMarks)
  })

  it('leaves the singer voices of the last run as they are for a lyrics-only run', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const run = handlers()

    await runTranscription(
      { ...request, mode: 'lyrics-only', lyrics: 'Silent night' },
      fakeClient(),
      run,
    )

    expect(vi.mocked(run.confirmReplace).mock.calls[0]?.[0].singerVoicesKept).toBe(true)
    expect(phrasesOn(voiceNamed('Singer 2').id)).toHaveLength(1)
  })

  it('replaces the marks of the voice of the last run when the person starts the run on a singer voice', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const singer = voiceNamed('Singer 2')
    const markCount = content().marks.length
    const run = handlers()

    await runTranscription({ ...request, voiceId: singer.id }, fakeClient(), run)

    // "Lead Vocals" is the voice of the last run, so it loses its marks in the range, and it stays because the run did not make it.
    expect(run.confirmReplace).toHaveBeenCalledWith({
      markCount,
      voiceName: 'Singer 2',
      range: { startMs: 0, endMs: 30_000 },
      singerVoiceNames: ['Lead Vocals'],
      singerVoicesKept: false,
    })
    expect(phrasesOn(VOICE)).toEqual([])
    expect(content().voices.map((voice) => voice.name)).toEqual([
      'Lead Vocals',
      'Singer 2',
      'Singer 3',
    ])
  })

  it('asks no question when no voice that the run replaces has a mark in the range', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const run = handlers()

    await runTranscription(
      { ...request, range: { startMs: 25_000, endMs: 30_000 } },
      fakeClient(),
      run,
    )

    expect(run.confirmReplace).not.toHaveBeenCalled()
  })

  it('replaces the marks of the voice only when the stored run data cannot be read', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const db = await import('../../store/db.ts')
    const spy = vi.spyOn(db, 'loadRunData').mockRejectedValueOnce(new Error('read failed'))
    const run = handlers()

    await runTranscription({ ...request, singerVoices: false }, fakeClient(), run)

    expect(vi.mocked(run.confirmReplace).mock.calls[0]?.[0].singerVoicesKept).toBe(false)
    spy.mockRestore()
  })

  it('gives no singer voice to replace after the person deletes it, and one undo brings it back', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const singer = voiceNamed('Singer 2')
    deleteVoice(singer.id)
    useSongStore.getState().undo()

    expect(voiceNamed('Singer 2')).toEqual(singer)
  })
})

/** Mutes the face preview of "Singer 2", so the undo test also checks the mute state. */
function setPreviewMutedOnSinger() {
  useSongStore.getState().apply((song) => ({
    ...song,
    voices: song.voices.map((voice) =>
      voice.name === 'Singer 2' ? { ...voice, previewMuted: true } : voice,
    ),
  }))
}
