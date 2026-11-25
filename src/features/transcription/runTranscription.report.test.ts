import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRunData } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { RunData } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
import { fixtureDiagnostics } from '../singer-voices/engine/fixtureSingerFinder.ts'
import { findSingers, SingersError } from '../singer-voices/singersClient.ts'
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
// Words that a test can look for in the stored data, to find a leak of the lyrics.
const WORDS: TimedWord[] = [
  { text: ' Zyxwvut', startMs: 100, endMs: 600 },
  { text: ' Quokkaberry,', startMs: 700, endMs: 1200 },
]
const STEREO: StereoAudio = {
  left: new Float32Array(4),
  right: new Float32Array(4),
  sampleRate: 44100,
}
const VOCALS = new Float32Array(2 * SPEECH_SAMPLE_RATE)
const SEGMENTS = [
  { startMs: 0, endMs: 650, singer: 0 },
  { startMs: 650, endMs: 1300, singer: 1 },
]

const request: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
  separateVocals: true,
}

function fakeClient(): TranscribeClient {
  return {
    device: 'webgpu',
    load: vi.fn(async () => undefined),
    transcribe: vi.fn(async () => WORDS),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
}

function handlers(controller = new AbortController()): TranscribeRunHandlers {
  return {
    signal: controller.signal,
    onDownload: vi.fn(),
    onStage: vi.fn(),
    onProgress: vi.fn(),
    onFinishing: vi.fn(),
    confirmReplace: vi.fn(async () => true),
    confirmLowMatch: vi.fn(async () => true),
    onSeparationDownload: vi.fn(),
    onSeparationProgress: vi.fn(),
    confirmNoSeparation: vi.fn(async () => true),
  }
}

let songId = ''

async function savedRun(): Promise<RunData> {
  const data = await loadRunData(songId)
  if (data === undefined) throw new Error('The run stored no run data.')
  return data
}

beforeEach(async () => {
  vi.mocked(resampleForSpeech).mockResolvedValue(new Float32Array(2 * SPEECH_SAMPLE_RATE))
  vi.mocked(decodeStereo).mockResolvedValue(STEREO)
  vi.mocked(separateVocals).mockResolvedValue({ vocals: new Float32Array(3) })
  vi.mocked(vocalsForSpeech).mockResolvedValue(VOCALS)
  vi.mocked(findSingers).mockImplementation(async (_vocals, singerHandlers) => {
    singerHandlers?.onDiagnostics?.(fixtureDiagnostics(1300, SEGMENTS))
    return SEGMENTS
  })
  vi.mocked(loadDictionary).mockResolvedValue({ ZYXWVUT: 'Z IH1 K', QUOKKABERRY: 'K W AA1 K' })
  const song = await storeNewSong({
    name: 'carol',
    durationMs: 30_000,
    audio: {
      data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
      fileName: 'carol.ogg',
      mimeType: 'audio/ogg',
    },
    voices: [{ id: VOICE, name: 'Lead Vocals', order: 0, color: '#e05d5d' }],
    marks: [],
  })
  songId = song.id
  await useSongStore.getState().openSong(song.id)
})

afterEach(() => {
  useSongStore.getState().closeSong()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('runTranscription stores the run report', () => {
  it('stores the report of a run with separation and no singer step', async () => {
    await runTranscription(request, fakeClient(), handlers())

    const { report, singerSegments } = await savedRun()
    expect(report).toMatchObject({
      source: 'browser',
      endpointHost: null,
      mode: 'model',
      speechModel: 'whisper-base',
      device: 'webgpu',
      separationModel: 'spleeter',
      separationFallback: false,
      wordCount: 2,
      phraseCount: 1,
      voices: [{ name: 'Lead Vocals', phraseCount: 1 }],
      range: { startMs: 0, endMs: 30_000 },
      frameMs: 50,
      notes: [],
    })
    expect(report.singers.status).toBe('option-off')
    expect(report.singers).not.toHaveProperty('selected')
    expect(report.build).toBe(__APP_BUILD__)
    expect(report.durationsMs.prepare).toBeTypeOf('number')
    expect(report.durationsMs.modelLoad).toBeTypeOf('number')
    expect(singerSegments).toEqual([])
  })

  it('stores no lyrics word', async () => {
    await runTranscription({ ...request, singerVoices: true }, fakeClient(), handlers())

    const json = JSON.stringify(await savedRun())
    expect(json).not.toContain('Zyxwvut')
    expect(json).not.toContain('Quokkaberry')
  })

  it('stores the singer ranges, the diagnostics and the assignment counts of the singer step', async () => {
    await runTranscription(
      { ...request, singerVoices: true, range: { startMs: 0, endMs: 2000 } },
      fakeClient(),
      handlers(),
    )

    const { report, singerSegments } = await savedRun()
    expect(singerSegments).toEqual(SEGMENTS)
    expect(report.singers).toMatchObject({
      status: 'split',
      failureKind: null,
      rangeCount: 2,
      shareThreshold: 0.3,
      singersWithPhrases: 2,
      phrasesWithNoSinger: 0,
      phrasesWithMoreSingers: 1,
      voicesMade: 2,
      selected: 'automatic',
    })
    expect(report.singers.diagnostics?.rawGroupCount).toBe(3)
    expect(report.voices.map((voice) => [voice.name, voice.made])).toEqual([
      ['Lead Vocals', false],
      ['Singer 2', true],
    ])
    expect(report.durationsMs.singers).toBeUndefined()
  })

  it('stores the count that the person selected in "Singers"', async () => {
    await runTranscription(
      { ...request, singerVoices: true, singerCount: 3 },
      fakeClient(),
      handlers(),
    )

    expect((await savedRun()).report.singers.selected).toBe(3)
  })

  it('reports one singer when the singer step finds one singer', async () => {
    vi.mocked(findSingers).mockResolvedValue([{ startMs: 0, endMs: 1300, singer: 0 }])

    await runTranscription({ ...request, singerVoices: true }, fakeClient(), handlers())

    const { report } = await savedRun()
    expect(report.singers).toMatchObject({ status: 'one-singer', voicesMade: 1, diagnostics: null })
    expect(report.notes).toEqual([])
  })

  it('reports the voices that the singer step made', async () => {
    vi.mocked(findSingers).mockResolvedValue([
      { startMs: 0, endMs: 600, singer: 0 },
      { startMs: 600, endMs: 1300, singer: 1 },
    ])
    const client = fakeClient()
    vi.mocked(client.transcribe).mockResolvedValue([
      { text: ' Zyxwvut.', startMs: 100, endMs: 500 },
      { text: ' Quokkaberry.', startMs: 2700, endMs: 3200 },
    ])

    await runTranscription({ ...request, singerVoices: true }, client, handlers())

    const { report } = await savedRun()
    expect(report.singers.diagnostics).toBeNull()
    expect(report.singers.phrasesWithNoSinger).toBe(1)
    expect(report.voices.map((voice) => voice.phraseCount)).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    )
    expect(report.voices.length).toBe(report.singers.voicesMade)
  })

  it('stores the report and a report line when the singer step fails', async () => {
    vi.mocked(findSingers).mockRejectedValue(new SingersError('memory', 'detail'))

    await runTranscription({ ...request, singerVoices: true }, fakeClient(), handlers())

    const { report, singerSegments } = await savedRun()
    expect(singerSegments).toEqual([])
    expect(report.singers).toMatchObject({ status: 'failed', failureKind: 'memory' })
    expect(report.notes.map((note) => note.text)).toEqual(['singers failed: memory'])
  })

  it('stores the report when the person cancels the singer step', async () => {
    const controller = new AbortController()
    vi.mocked(findSingers).mockImplementation(async () => {
      controller.abort()
      throw new SingersError('cancelled', 'cancelled')
    })

    await runTranscription({ ...request, singerVoices: true }, fakeClient(), handlers(controller))

    expect((await savedRun()).report.singers.status).toBe('cancelled')
  })

  it('reports "no-vocals" and a separation line after "Continue with no separation"', async () => {
    vi.mocked(separateVocals).mockRejectedValue(new SeparateError('model', 'detail'))

    await runTranscription({ ...request, singerVoices: true }, fakeClient(), handlers())

    const { report } = await savedRun()
    expect(report.separationModel).toBe('none')
    expect(report.singers.status).toBe('no-vocals')
    expect(report.notes.map((note) => note.text)).toEqual([
      'separation failed: model; continued with no separation',
      'singers: no separated vocals',
    ])
  })

  it('reports the change to the fast model', async () => {
    vi.mocked(separateVocals)
      .mockRejectedValueOnce(new SeparateError('memory', 'std::bad_alloc'))
      .mockResolvedValueOnce({ vocals: new Float32Array(3) })
    const run = handlers()
    vi.mocked(run.confirmNoSeparation).mockResolvedValue('fast-model')

    await runTranscription({ ...request, separationModel: 'demucs' }, fakeClient(), run)

    const { report } = await savedRun()
    expect(report).toMatchObject({ separationModel: 'spleeter', separationFallback: true })
    expect(report.notes.map((note) => note.text)).toEqual([
      'separation failed: memory; continued with the fast model',
    ])
  })

  it('keeps the old run data when the person cancels the run', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const before = await savedRun()
    const controller = new AbortController()
    const client = fakeClient()
    vi.mocked(client.transcribe).mockImplementation(async () => {
      controller.abort()
      return WORDS
    })

    await expect(runTranscription(request, client, handlers(controller))).rejects.toMatchObject({
      kind: 'cancelled',
    })

    expect(await savedRun()).toEqual(before)
  })

  it('replaces the report of the earlier run', async () => {
    await runTranscription(request, fakeClient(), handlers())

    await runTranscription({ ...request, separateVocals: false }, fakeClient(), handlers())

    expect((await savedRun()).report.separationModel).toBe('none')
  })

  it('completes the run with no run data when the browser storage is full', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
    })

    const outcome = await runTranscription(request, fakeClient(), handlers())

    vi.restoreAllMocks()
    expect(outcome.wordCount).toBe(2)
    expect(await loadRunData(songId)).toBeUndefined()
  })

  it('stores the report of a lyrics-only run with no speech model and no device', async () => {
    await runTranscription(
      { voiceId: VOICE, speechModelId: 'whisper-base', mode: 'lyrics-only', lyrics: 'one two' },
      fakeClient(),
      handlers(),
    )

    expect((await savedRun()).report).toMatchObject({
      mode: 'lyrics-only',
      speechModel: null,
      device: null,
      separationModel: 'none',
      wordCount: 2,
    })
  })

  it('adds a report line when the break down fails', async () => {
    vi.mocked(loadDictionary).mockRejectedValue(new Error('no dictionary'))

    await runTranscription(request, fakeClient(), handlers())

    expect((await savedRun()).report.notes.map((note) => note.text)).toContain('break down failed')
  })

  it('stores the host of a remote endpoint, and no key and no full address', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    FakeXhr.responder = (xhr) =>
      xhr.respond(200, { words: [{ word: 'Zyxwvut', start: 0.1, end: 0.6 }] })
    const remote = {
      baseUrl: 'https://speech.example.com/v1',
      apiKey: 'sk-secret',
      model: 'whisper-1',
    }

    await runTranscription({ ...request, remote }, fakeClient(), handlers())

    FakeXhr.reset()
    vi.unstubAllGlobals()
    const { report } = await savedRun()
    expect(report).toMatchObject({
      source: 'remote',
      endpointHost: 'speech.example.com',
      speechModel: 'whisper-1',
      device: null,
    })
    const json = JSON.stringify(report)
    expect(json).not.toContain('sk-secret')
    expect(json).not.toContain('https://')
  })
})
