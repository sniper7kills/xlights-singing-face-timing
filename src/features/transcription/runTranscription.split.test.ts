import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { addVoice } from '../../store/actions/voices.ts'
import { loadRunData } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
import type { SingerTrack } from '../singer-split/protocol.ts'
import { SplitError, splitSingers } from '../singer-split/splitClient.ts'
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import { SeparateError, separateVocals } from '../vocal-separation/separateClient.ts'
import {
  decodeStereo,
  resampleSeparated,
  vocalsForSpeech,
} from '../vocal-separation/separationAudio.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { postTranscription } from './remoteClient.ts'
import { resampleForSpeech } from './resample.ts'
import {
  NoWordsError,
  runTranscription,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { NoSplitRoomError } from './splitRun.ts'
import type { TranscribeClient } from './transcribeClient.ts'
import type { TimedWord } from './types.ts'

vi.mock('./resample.ts', () => ({ resampleForSpeech: vi.fn() }))
vi.mock('./remoteClient.ts', () => ({ postTranscription: vi.fn() }))
vi.mock('../vocal-separation/separateClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../vocal-separation/separateClient.ts')>()),
  separateVocals: vi.fn(),
}))
vi.mock('../vocal-separation/separationAudio.ts', () => ({
  decodeStereo: vi.fn(),
  vocalsForSpeech: vi.fn(),
  resampleSeparated: vi.fn(),
}))
vi.mock('../singer-split/splitClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../singer-split/splitClient.ts')>()),
  splitSingers: vi.fn(),
}))
vi.mock('../phoneme-breakdown/loadDictionary.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../phoneme-breakdown/loadDictionary.ts')>()),
  loadDictionary: vi.fn(),
}))

const VOICE = 'voice-1'
/** The words of the first singer track: one phrase from 1 s to 6 s. */
const FIRST_WORDS: TimedWord[] = [
  { text: ' Silent', startMs: 1000, endMs: 3000 },
  { text: ' night.', startMs: 3000, endMs: 6000 },
]
/** The words of the second singer track: one phrase from 4 s to 8 s, so it overlaps the first phrase. */
const SECOND_WORDS: TimedWord[] = [
  { text: ' Holy', startMs: 4000, endMs: 5000 },
  { text: ' night', startMs: 5000, endMs: 6000 },
  { text: ' calm.', startMs: 6000, endMs: 8000 },
]
const STEREO: StereoAudio = {
  left: new Float32Array(4),
  right: new Float32Array(4),
  sampleRate: 44100,
}
const FULL_VOCALS = new Float32Array([0.5, 0.5, 0.5])
const SPEECH = new Float32Array(10 * SPEECH_SAMPLE_RATE)
/** A singer track at the speech model sample rate with a voice in each part. The level rule of issue #200 keeps all its words. */
const VOICED_TRACK = new Float32Array(10 * SPEECH_SAMPLE_RATE).fill(0.5)

const request: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
  separateVocals: true,
  splitSingers: true,
  splitMode: 'male-female',
}

function track(label: SingerTrack['label']): SingerTrack {
  return {
    label,
    audio: { left: new Float32Array(3), right: new Float32Array(3), sampleRate: 44100 },
  }
}

/** Makes the first singer track at the speech model sample rate, the female track, have the samples `first`. */
function firstSpeechTrack(first: Float32Array): void {
  let speechCalls = 0
  vi.mocked(resampleSeparated).mockImplementation(async (_samples, sampleRate) => {
    if (sampleRate !== SPEECH_SAMPLE_RATE) return VOICED_TRACK
    speechCalls += 1
    return speechCalls === 1 ? first : VOICED_TRACK
  })
}

function fakeClient(): TranscribeClient {
  let calls = 0
  return {
    device: 'wasm',
    load: vi.fn(async () => undefined),
    transcribe: vi.fn(async () => {
      calls += 1
      return calls === 1 ? FIRST_WORDS : SECOND_WORDS
    }),
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
    confirmLyricsFit: vi.fn(async () => true),
    onSeparationDownload: vi.fn(),
    onSeparationProgress: vi.fn(),
    confirmNoSeparation: vi.fn(async () => true),
    onSplitDownload: vi.fn(),
    onSplitProgress: vi.fn(),
  }
}

const content = () => {
  const current = useSongStore.getState().current
  if (current === null) throw new Error('No song is open.')
  return current
}
const voiceNames = () => content().voices.map((voice) => voice.name)
const voiceId = (name: string) => content().voices.find((voice) => voice.name === name)?.id ?? ''
const marksOn = (name: string, layer: Mark['layer']): Mark[] =>
  content().marks.filter((mark) => mark.voiceId === voiceId(name) && mark.layer === layer)
const undoSteps = () => useSongStore.getState().history.past.length

async function openSong() {
  const song = await storeNewSong({
    name: 'carol',
    durationMs: 10_000,
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
  vi.mocked(resampleForSpeech).mockResolvedValue(SPEECH)
  vi.mocked(decodeStereo).mockResolvedValue(STEREO)
  vi.mocked(separateVocals).mockResolvedValue({
    vocals: FULL_VOCALS,
    instruments: new Float32Array(3),
  })
  vi.mocked(vocalsForSpeech).mockResolvedValue(SPEECH)
  vi.mocked(resampleSeparated).mockResolvedValue(VOICED_TRACK)
  // The engine can return the tracks in any order.
  vi.mocked(splitSingers).mockImplementation(async (_vocals, mode, splitHandlers) => {
    splitHandlers?.onDownload?.(1, 2)
    splitHandlers?.onProgress?.(500, 1000)
    return {
      tracks:
        mode === 'male-female'
          ? [track('male'), track('female')]
          : [track('backing'), track('lead')],
    }
  })
  vi.mocked(loadDictionary).mockResolvedValue({
    SILENT: 'S AY1 L AH0 N T',
    NIGHT: 'N AY1 T',
    HOLY: 'HH OW1 L IY0',
    CALM: 'K AA1 M',
  })
  await openSong()
})

afterEach(() => {
  useSongStore.getState().closeSong()
  vi.clearAllMocks()
})

describe('runTranscription with the singer split', () => {
  it('puts the words of each singer track on its own new voice, with phrases that overlap in time', async () => {
    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
    const [female] = marksOn('Female', 'phrase')
    const [male] = marksOn('Male', 'phrase')
    expect(female).toMatchObject({ label: 'Silent night.', startMs: 1000, endMs: 6000 })
    expect(male).toMatchObject({ label: 'Holy night calm.', startMs: 4000, endMs: 8000 })
    expect(marksOn('Female', 'phoneme').length).toBeGreaterThan(0)
    expect(marksOn('Lead Vocals', 'phrase')).toEqual([])
    expect(outcome).toMatchObject({
      wordCount: 5,
      split: { status: 'split', voiceNames: ['Female', 'Male'], emptyTracks: [] },
    })
  })

  it('gives the 44 100 Hz vocals and the mode to the split, and reports the step', async () => {
    const run = handlers()

    await runTranscription({ ...request, splitMode: 'lead-backing' }, fakeClient(), run)

    expect(splitSingers).toHaveBeenCalledWith(
      { left: FULL_VOCALS, right: FULL_VOCALS, sampleRate: 44100 },
      'lead-backing',
      expect.objectContaining({ signal: run.signal }),
    )
    expect(run.onStage).toHaveBeenCalledWith('split-download')
    expect(run.onStage).toHaveBeenCalledWith('splitting')
    expect(run.onSplitDownload).toHaveBeenCalledWith(1, 2)
    expect(run.onSplitProgress).toHaveBeenCalledWith(500, 1000)
    expect(voiceNames()).toEqual(['Lead Vocals', 'Lead', 'Backing'])
  })

  it('writes the run as one undo step, so one undo removes both voices and one redo restores them', async () => {
    const before = undoSteps()

    await runTranscription(request, fakeClient(), handlers())

    expect(undoSteps()).toBe(before + 1)
    useSongStore.getState().undo()
    expect(voiceNames()).toEqual(['Lead Vocals'])
    expect(content().marks).toEqual([])
    useSongStore.getState().redo()
    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(marksOn('Male', 'phrase')).toHaveLength(1)
  })

  it('reads no lyrics and adds no section', async () => {
    const lyrics = '[Verse]\nSilent night holy night'

    await runTranscription({ ...request, lyrics, addSections: true }, fakeClient(), handlers())

    expect(marksOn('Female', 'phrase').map((mark) => mark.label)).toEqual(['Silent night.'])
    expect(content().sections).toEqual([])
  })

  it('replaces the voices of the last split run, so a second run keeps two singer voices', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const run = handlers()

    await runTranscription(request, fakeClient(), run)

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(marksOn('Female', 'phrase')).toHaveLength(1)
    expect(run.confirmReplace).toHaveBeenCalledWith(
      expect.objectContaining({ singerVoiceNames: ['Female', 'Male'] }),
    )
  })

  it('names a new voice "Female 2" when the song has a voice "Female"', async () => {
    addVoice(content().song.id, 'Female')

    await runTranscription(request, fakeClient(), handlers())

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Female 2', 'Male'])
  })

  it('does not start when the song has no room for two more voices', async () => {
    for (let count = 1; count < MAX_VOICES - 1; count++) addVoice(content().song.id)
    const run = handlers()

    await expect(runTranscription(request, fakeClient(), run)).rejects.toBeInstanceOf(
      NoSplitRoomError,
    )

    expect(separateVocals).not.toHaveBeenCalled()
    expect(run.confirmReplace).not.toHaveBeenCalled()
  })

  it('stops before any transcription when a range run frees no voice of the last run and the song has no room', async () => {
    await runTranscription(request, fakeClient(), handlers())
    // The song has 11 voices: "Lead Vocals", "Female", "Male" and 8 more.
    for (let count = 3; count < MAX_VOICES - 1; count++) addVoice(content().song.id)
    vi.mocked(separateVocals).mockClear()
    const client = fakeClient()
    const run = handlers()

    // The range is outside the marks of "Female" and "Male", so the run empties neither voice.
    const failure = runTranscription(
      { ...request, range: { startMs: 8500, endMs: 10_000 } },
      client,
      run,
    )

    await expect(failure).rejects.toBeInstanceOf(NoSplitRoomError)
    expect(separateVocals).not.toHaveBeenCalled()
    expect(client.transcribe).not.toHaveBeenCalled()
    expect(run.confirmReplace).not.toHaveBeenCalled()
  })

  it('counts the voices of the last run that the range run empties as free', async () => {
    await runTranscription(request, fakeClient(), handlers())
    for (let count = 3; count < MAX_VOICES - 1; count++) addVoice(content().song.id)

    await runTranscription(
      { ...request, range: { startMs: 0, endMs: 10_000 } },
      fakeClient(),
      handlers(),
    )

    expect(voiceNames()).toHaveLength(MAX_VOICES - 1)
    expect(marksOn('Female', 'phrase')).toHaveLength(1)
    expect(marksOn('Male', 'phrase')).toHaveLength(1)
  })

  it('makes no voice for a singer track with no words, and the report counts 0 words for it', async () => {
    const client = fakeClient()
    vi.mocked(client.transcribe).mockResolvedValueOnce(FIRST_WORDS).mockResolvedValueOnce([])

    const outcome = await runTranscription({ ...request, keepTracks: true }, client, handlers())

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female'])
    expect(outcome.split).toEqual({
      status: 'split',
      voiceNames: ['Female'],
      emptyTracks: ['Male'],
    })
    const data = await loadRunData(content().song.id)
    expect(data?.report.split?.tracks).toEqual([
      { label: 'female', voiceName: 'Female', wordCount: 2, removedCount: 0 },
      { label: 'male', voiceName: '', wordCount: 0, removedCount: 0 },
    ])
    expect(data?.voices?.find((entry) => entry.voiceId === voiceId('Female'))).toMatchObject({
      made: true,
      splitTrack: 0,
    })
  })

  it('sends no audio of a singer track with no voice to the speech model, and the track has no words', async () => {
    // The female track is 0 in each part, as a model track with no singer gives.
    firstSpeechTrack(new Float32Array(10 * SPEECH_SAMPLE_RATE))
    const client = fakeClient()

    const outcome = await runTranscription({ ...request, keepTracks: true }, client, handlers())

    expect(client.transcribe).toHaveBeenCalledTimes(1)
    expect(outcome.split).toMatchObject({ voiceNames: ['Male'], emptyTracks: ['Female'] })
    expect(marksOn('Male', 'phrase')).toEqual([expect.objectContaining({ label: 'Silent night.' })])
    const data = await loadRunData(content().song.id)
    expect(data?.report.split?.tracks).toEqual([
      { label: 'female', voiceName: '', wordCount: 0, removedCount: null },
      { label: 'male', voiceName: 'Male', wordCount: 2, removedCount: 0 },
    ])
  })

  it('removes the words in the silent parts of a singer track and reports their count', async () => {
    const partly = new Float32Array(10 * SPEECH_SAMPLE_RATE)
    // The track has a voice from 0 s to 3 s only, so " night." from 3 s to 6 s has no voice.
    partly.fill(0.5, 0, 3 * SPEECH_SAMPLE_RATE)
    firstSpeechTrack(partly)

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(outcome.wordCount).toBe(4)
    expect(marksOn('Female', 'word').map((mark) => mark.label)).toEqual(['Silent'])
    const data = await loadRunData(content().song.id)
    expect(data?.report.split?.tracks.map((track) => track.removedCount)).toEqual([1, 0])
  })

  it('rejects with NoWordsError and changes no mark when both singer tracks have no words', async () => {
    const client = fakeClient()
    vi.mocked(client.transcribe).mockResolvedValue([])

    await expect(runTranscription(request, client, handlers())).rejects.toBeInstanceOf(NoWordsError)
    expect(voiceNames()).toEqual(['Lead Vocals'])
  })

  it('removes the split voice of the last run that a new split run on it empties, and undo restores it', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const before = content()

    await runTranscription({ ...request, voiceId: voiceId('Female') }, fakeClient(), handlers())

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(content().voices.some((voice) => voice.id === before.voices[1]?.id)).toBe(false)
    useSongStore.getState().undo()
    expect(content()).toStrictEqual(before)
  })

  it('keeps the voice of the run that the person made when a split run empties it', async () => {
    await runTranscription({ ...request, splitSingers: false }, fakeClient(), handlers())
    expect(marksOn('Lead Vocals', 'phrase').length).toBeGreaterThan(0)

    await runTranscription(request, fakeClient(), handlers())

    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(marksOn('Lead Vocals', 'phrase')).toEqual([])
  })

  it('rejects with the failure of the split and changes no mark', async () => {
    vi.mocked(splitSingers).mockRejectedValue(new SplitError('not-available', 'none'))

    await expect(runTranscription(request, fakeClient(), handlers())).rejects.toMatchObject({
      kind: 'not-available',
    })

    expect(voiceNames()).toEqual(['Lead Vocals'])
    expect(content().marks).toEqual([])
  })

  it('rejects as cancelled when the person cancels during the split', async () => {
    const controller = new AbortController()
    vi.mocked(splitSingers).mockImplementation(async () => {
      controller.abort()
      throw new SplitError('cancelled', 'stop')
    })

    await expect(
      runTranscription(request, fakeClient(), handlers(controller)),
    ).rejects.toMatchObject({ name: 'TranscribeError', kind: 'cancelled' })
  })

  it('keeps the words on the voice of the run when the separation failed and the person continued', async () => {
    vi.mocked(separateVocals).mockRejectedValue(new SeparateError('memory', 'full'))

    const outcome = await runTranscription(request, fakeClient(), handlers())

    expect(splitSingers).not.toHaveBeenCalled()
    expect(voiceNames()).toEqual(['Lead Vocals'])
    expect(outcome.split).toEqual({ status: 'no-vocals', voiceName: 'Lead Vocals' })
  })

  it('sends each singer track to the remote endpoint as its own request', async () => {
    vi.mocked(postTranscription)
      .mockResolvedValueOnce(FIRST_WORDS)
      .mockResolvedValueOnce(SECOND_WORDS)
    const remote = { baseUrl: 'https://stt.example', apiKey: '', model: 'whisper-1' }

    await runTranscription({ ...request, remote }, fakeClient(), handlers())

    expect(postTranscription).toHaveBeenCalledTimes(2)
    expect(marksOn('Male', 'phrase')).toHaveLength(1)
  })

  it('stores the singer tracks, the voice of each track and the split in the report', async () => {
    await runTranscription({ ...request, keepTracks: true }, fakeClient(), handlers())

    const data = await loadRunData(content().song.id)
    expect(data?.tracks?.split).toHaveLength(2)
    expect(data?.voices).toEqual([
      { voiceId: VOICE, singers: [], made: false },
      { voiceId: voiceId('Female'), singers: [], made: true, splitTrack: 0 },
      { voiceId: voiceId('Male'), singers: [], made: true, splitTrack: 1 },
    ])
    expect(data?.report.split).toEqual({
      mode: 'male-female',
      tracks: [
        { label: 'female', voiceName: 'Female', wordCount: 2, removedCount: 0 },
        { label: 'male', voiceName: 'Male', wordCount: 3, removedCount: 0 },
      ],
    })
    expect(data?.report.durationsMs).toHaveProperty('splitDownload')
  })

  it('counts the two kept singer tracks in the audio tracks of the report', async () => {
    await runTranscription({ ...request, keepTracks: true }, fakeClient(), handlers())

    expect((await loadRunData(content().song.id))?.report.trackCount).toBe(4)
  })

  it('counts no singer track in the audio tracks of the report when the run keeps no track', async () => {
    await runTranscription({ ...request, keepTracks: false }, fakeClient(), handlers())

    expect((await loadRunData(content().song.id))?.report.trackCount).toBe(2)
  })

  it('states that the singer voices of a split run do not change at a later run with no split', async () => {
    await runTranscription(request, fakeClient(), handlers())
    const run = handlers()

    // A run on the voice "Female" replaces its marks and asks first. The voice "Male" keeps its marks.
    const female = voiceId('Female')
    await runTranscription({ ...request, voiceId: female, splitSingers: false }, fakeClient(), run)

    expect(run.confirmReplace).toHaveBeenCalledWith(
      expect.objectContaining({ singerVoicesKept: true }),
    )
    expect(voiceNames()).toEqual(['Lead Vocals', 'Female', 'Male'])
  })

  it('runs the singer step and no split when the request has the split off', async () => {
    await runTranscription({ ...request, splitSingers: false }, fakeClient(), handlers())

    expect(splitSingers).not.toHaveBeenCalled()
    expect(voiceNames()).toEqual(['Lead Vocals'])
  })
})
