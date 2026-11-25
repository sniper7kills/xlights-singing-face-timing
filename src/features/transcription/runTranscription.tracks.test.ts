import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEPT_TRACK_SAMPLE_RATE } from '../../lib/audio/pcm.ts'
import { loadRunData } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { RunData } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import { SeparateError, separateVocals } from '../vocal-separation/separateClient.ts'
import {
  decodeStereo,
  resampleSeparated,
  vocalsForSpeech,
} from '../vocal-separation/separationAudio.ts'
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
  resampleSeparated: vi.fn(),
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
/** 2 seconds of vocals and of instruments at 44 100 Hz. */
const VOCALS_44K = new Float32Array(2 * 44_100).fill(0.5)
const INSTRUMENTS_44K = new Float32Array(2 * 44_100).fill(-0.25)
const VOCALS = new Float32Array(2 * SPEECH_SAMPLE_RATE)

const request: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
  separateVocals: true,
  keepTracks: true,
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
  vi.mocked(separateVocals).mockImplementation(async (_audio, separateHandlers) =>
    separateHandlers?.instruments === true
      ? { vocals: VOCALS_44K, instruments: INSTRUMENTS_44K }
      : { vocals: VOCALS_44K },
  )
  vi.mocked(vocalsForSpeech).mockResolvedValue(VOCALS)
  // Half of 44 100 Hz gives half of the samples.
  vi.mocked(resampleSeparated).mockImplementation(async (samples, rate) =>
    samples.slice(0, Math.round((samples.length * rate) / 44_100)),
  )
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

describe('runTranscription keeps the audio tracks', () => {
  it('keeps the vocals and the instruments as 16-bit PCM at 22 050 Hz after a separation', async () => {
    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(vi.mocked(separateVocals).mock.calls[0]?.[1]?.instruments).toBe(true)
    expect(resampleSeparated).toHaveBeenCalledWith(VOCALS_44K, KEPT_TRACK_SAMPLE_RATE)
    expect(resampleSeparated).toHaveBeenCalledWith(INSTRUMENTS_44K, KEPT_TRACK_SAMPLE_RATE)
    const { tracks, report } = await savedRun()
    expect(tracks?.vocals.samples).toHaveLength(2 * KEPT_TRACK_SAMPLE_RATE)
    expect(tracks?.vocals.samples[0]).toBe(16384)
    expect(tracks?.instruments.samples[0]).toBe(-8192)
    expect(tracks?.vocals.startMs).toBe(0)
    expect(report).toMatchObject({
      trackCount: 2,
      tracksKept: true,
      separationModel: 'spleeter',
      source: 'browser',
      device: 'webgpu',
      speechModel: 'whisper-base',
      wordCount: 2,
      phraseCount: 1,
      voices: [{ name: 'Lead Vocals', phraseCount: 1 }],
      range: { startMs: 0, endMs: 30_000 },
      frameMs: 50,
    })
    expect(report.durationsMs.prepare).toBeTypeOf('number')
    expect(outcome.runData).toBe('stored')
  })

  it('keeps no lyrics word in the run data', async () => {
    await runTranscription(request, fakeClient(), handlers())

    const json = JSON.stringify(await savedRun())
    expect(json).not.toContain('Zyxwvut')
    expect(json).not.toContain('Quokkaberry')
  })

  it('asks for no instruments and keeps no tracks without the keep option', async () => {
    await runTranscription({ ...request, keepTracks: false }, fakeClient(), handlers())

    expect(vi.mocked(separateVocals).mock.calls[0]?.[1]?.instruments).toBe(false)
    expect(resampleSeparated).not.toHaveBeenCalled()
    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report).toMatchObject({ trackCount: 2, tracksKept: false })
  })

  it('keeps no tracks and adds a report line after "Continue with no separation"', async () => {
    vi.mocked(separateVocals).mockRejectedValue(new SeparateError('model', 'detail'))

    await runTranscription(request, fakeClient(), handlers())

    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report).toMatchObject({ trackCount: 0, separationModel: 'none' })
    expect(report.notes).toEqual([
      {
        step: 'separation',
        kind: 'model',
        text: 'separation failed: model; continued with no separation',
      },
    ])
  })

  it('keeps the tracks of Spleeter and adds a report line after "Use the fast model"', async () => {
    vi.mocked(separateVocals)
      .mockRejectedValueOnce(new SeparateError('memory', 'std::bad_alloc'))
      .mockResolvedValueOnce({ vocals: VOCALS_44K, instruments: INSTRUMENTS_44K })
    const run = handlers()
    vi.mocked(run.confirmNoSeparation).mockResolvedValue('fast-model')

    await runTranscription({ ...request, separationModel: 'demucs' }, fakeClient(), run)

    const { tracks, report } = await savedRun()
    expect(tracks?.instruments.samples).toHaveLength(2 * KEPT_TRACK_SAMPLE_RATE)
    expect(report.separationModel).toBe('spleeter')
    expect(report.notes.map((note) => note.text)).toEqual([
      'separation failed: memory; continued with the fast model',
    ])
  })

  it('keeps the tracks of the range only, with the start of the range', async () => {
    const range = { startMs: 5000, endMs: 7000 }

    await runTranscription({ ...request, range }, fakeClient(), handlers())

    const { tracks, report } = await savedRun()
    expect(tracks?.vocals.startMs).toBe(5000)
    expect(tracks?.instruments.startMs).toBe(5000)
    expect(report.range).toEqual(range)
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

  it('replaces the tracks of the earlier run with no tracks after a run with no separation', async () => {
    await runTranscription(request, fakeClient(), handlers())

    await runTranscription({ ...request, separateVocals: false }, fakeClient(), handlers())

    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report.separationModel).toBe('none')
  })

  it('completes the run, keeps the report without tracks and adds a report line when the storage is full', async () => {
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'runs' && (value as RunData).tracks !== undefined)
        throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
      return put.call(this, value, key)
    })

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(outcome.runData).toBe('storage-full')
    expect(outcome.wordCount).toBe(2)
    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report.tracksKept).toBe(false)
    expect(report.notes.map((note) => note.text)).toEqual([
      'audio tracks not kept: the browser storage is full',
    ])
  })

  it('completes the run with no run data when the storage cannot keep the report', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota is exceeded.', 'QuotaExceededError')
    })

    const outcome = await runTranscription(request, fakeClient(), handlers())

    vi.restoreAllMocks()
    expect(outcome.wordCount).toBe(2)
    expect(outcome.runData).toBe('failed')
    expect(await loadRunData(songId)).toBeUndefined()
  })

  it('keeps no tracks and adds a report line when the tracks do not convert', async () => {
    vi.mocked(resampleSeparated).mockRejectedValue(new Error('render failed'))

    await runTranscription(request, fakeClient(), handlers())

    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report.notes.map((note) => note.kind)).toEqual(['unknown'])
  })

  it('keeps the tracks of a remote run that separates the vocals', async () => {
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
    const { tracks, report } = await savedRun()
    expect(tracks?.vocals.samples).toHaveLength(2 * KEPT_TRACK_SAMPLE_RATE)
    expect(report).toMatchObject({ source: 'remote', trackCount: 2, tracksKept: true })
  })

  it('keeps no tracks and no error after a lyrics-only run', async () => {
    const outcome = await runTranscription(
      { voiceId: VOICE, speechModelId: 'whisper-base', mode: 'lyrics-only', lyrics: 'one two' },
      fakeClient(),
      handlers(),
    )

    expect(outcome.runData).toBe('stored')
    expect(separateVocals).not.toHaveBeenCalled()
    const { tracks, report } = await savedRun()
    expect(tracks).toBeUndefined()
    expect(report).toMatchObject({ trackCount: 0, tracksKept: false })
  })
})
