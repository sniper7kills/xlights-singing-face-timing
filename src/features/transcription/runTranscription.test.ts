import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { DictionaryLoadError, loadDictionary } from '../phoneme-breakdown/loadDictionary.ts'
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
vi.mock('../phoneme-breakdown/loadDictionary.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../phoneme-breakdown/loadDictionary.ts')>()),
  loadDictionary: vi.fn(),
}))

const DICTIONARY = { SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T' }

const audio = {
  data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

const VOICE = 'voice-1'

const WORDS: TimedWord[] = [
  { text: ' Silent', startMs: 100, endMs: 600 },
  { text: ' night,', startMs: 700, endMs: 1200 },
]

function oldMark(id: string, startMs: number, endMs: number): Mark {
  return {
    id,
    voiceId: VOICE,
    layer: 'phrase',
    label: id,
    startMs,
    endMs,
    parentId: null,
    edited: false,
  }
}

function fakeClient(words: TimedWord[] = WORDS): TranscribeClient {
  return {
    device: 'wasm',
    load: vi.fn(async (_id: string, onDownload?: (loaded: number, total: number) => void) => {
      onDownload?.(500_000, 1_000_000)
    }),
    transcribe: vi.fn(async (_samples, _offsetMs, handlers) => {
      handlers?.onStage?.('transcribing')
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
    onStage: vi.fn(),
    onProgress: vi.fn(),
    onFinishing: vi.fn(),
    confirmReplace: vi.fn(async () => true),
    confirmLowMatch: vi.fn(async () => true),
  }
}

const modelRequest: TranscribeRequest = {
  voiceId: VOICE,
  speechModelId: 'whisper-base',
  mode: 'model',
}

const lyricsOnly: TranscribeRequest = {
  ...modelRequest,
  mode: 'lyrics-only',
  lyrics: 'Silent night, holy night\n[Chorus]\nAll is calm',
}

const marks = () => useSongStore.getState().current?.marks ?? []
const labels = (layer: Mark['layer']) =>
  marks()
    .filter((mark) => mark.layer === layer)
    .map((mark) => mark.label)

async function openSong(existing: Mark[] = []) {
  const song = await storeNewSong({
    name: 'carol',
    durationMs: 30_000,
    audio,
    voices: [{ id: VOICE, name: 'Lead Vocals', order: 0, color: '#e05d5d' }],
    marks: existing,
  })
  await useSongStore.getState().openSong(song.id)
}

beforeEach(async () => {
  // 30 seconds of audio at the speech model sample rate.
  vi.mocked(resampleForSpeech).mockResolvedValue(new Float32Array(30 * SPEECH_SAMPLE_RATE))
  vi.mocked(loadDictionary).mockResolvedValue(DICTIONARY)
  await openSong()
})

afterEach(() => {
  useSongStore.getState().closeSong()
})

describe('runTranscription with the speech model', () => {
  it('loads the speech model, transcribes the audio and returns the counts of the word marks', async () => {
    const client = fakeClient()
    const run = handlers()

    const outcome = await runTranscription(modelRequest, client, run)

    expect(outcome).toEqual({ wordCount: 2, estimatedCount: 0, breakDownFailure: null })
    expect(client.load).toHaveBeenCalledWith('whisper-base', run.onDownload)
    expect(run.onDownload).toHaveBeenCalledWith(500_000, 1_000_000)
    expect(run.onProgress).toHaveBeenCalledExactlyOnceWith(20_000, 30_000)
    expect(run.onFinishing).toHaveBeenCalledOnce()
  })

  it('reports the steps before the first progress in order, and sends no progress of 0', async () => {
    const steps: string[] = []
    const client = fakeClient()
    vi.mocked(client.load).mockImplementation(async () => {
      steps.push('load')
    })
    const run = handlers()
    vi.mocked(run.onStage).mockImplementation((stage) => steps.push(stage))
    vi.mocked(resampleForSpeech).mockImplementation(async () => {
      steps.push('resample')
      return new Float32Array(30 * SPEECH_SAMPLE_RATE)
    })

    await runTranscription(modelRequest, client, run)

    expect(steps).toEqual(['preparing', 'resample', 'loading', 'load', 'transcribing'])
    expect(run.onProgress).not.toHaveBeenCalledWith(0, expect.any(Number))
  })

  it('reports no step for a lyrics-only run', async () => {
    const run = handlers()

    await runTranscription(lyricsOnly, fakeClient(), run)

    expect(run.onStage).not.toHaveBeenCalled()
  })

  it('writes the grouped phrase and the words with clean labels when no lyrics are supplied', async () => {
    await runTranscription(modelRequest, fakeClient(), handlers())

    expect(labels('phrase')).toEqual(['Silent night,'])
    expect(labels('word')).toEqual(['Silent', 'night'])
    expect(marks().every((mark) => mark.voiceId === VOICE)).toBe(true)
  })

  it('records the run as one undo step that restores the earlier marks', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('old-phrase', 5000, 6000)])

    await runTranscription(modelRequest, fakeClient(), handlers())
    expect(labels('word')).toEqual(['Silent', 'night'])
    expect(useSongStore.getState().history.past).toHaveLength(1)

    useSongStore.getState().undo()
    expect(marks()).toEqual([oldMark('old-phrase', 5000, 6000)])
  })

  it('aligns the words with the lyrics and takes the lyrics spelling for a good match', async () => {
    const run = handlers()

    const outcome = await runTranscription(
      { ...modelRequest, lyrics: 'SILENT night, holy night' },
      fakeClient(),
      run,
    )

    expect(labels('phrase')).toEqual(['SILENT night, holy night'])
    expect(labels('word')).toEqual(['SILENT', 'night', 'holy', 'night'])
    expect(outcome).toEqual({ wordCount: 4, estimatedCount: 2, breakDownFailure: null })
    expect(run.confirmLowMatch).not.toHaveBeenCalled()
  })

  it('asks before it writes a low lyrics match, and writes the marks for "Continue"', async () => {
    const run = handlers()

    await runTranscription(
      { ...modelRequest, lyrics: 'Away in a manger no crib for a bed' },
      fakeClient(),
      run,
    )

    expect(run.confirmLowMatch).toHaveBeenCalledWith(0)
    expect(labels('phrase')).toEqual(['Away in a manger no crib for a bed'])
  })

  it('rejects as cancelled and writes no mark when the person declines a low lyrics match', async () => {
    const run = handlers()
    vi.mocked(run.confirmLowMatch).mockResolvedValue(false)

    const result = runTranscription(
      { ...modelRequest, lyrics: 'Away in a manger' },
      fakeClient(),
      run,
    )

    await expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    expect(marks()).toEqual([])
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('asks before the download when marks exist, and replaces them for "Continue"', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('old-phrase', 5000, 6000)])
    const client = fakeClient()
    const run = handlers()
    vi.mocked(run.confirmReplace).mockImplementation(async () => {
      expect(client.load).not.toHaveBeenCalled()
      return true
    })

    await runTranscription(modelRequest, client, run)

    expect(run.confirmReplace).toHaveBeenCalledOnce()
    expect(labels('phrase')).toEqual(['Silent night,'])
  })

  it('rejects as cancelled, loads no speech model and keeps the marks when the person declines the replace', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('old-phrase', 5000, 6000)])
    const client = fakeClient()
    const run = handlers()
    vi.mocked(run.confirmReplace).mockResolvedValue(false)

    await expect(runTranscription(modelRequest, client, run)).rejects.toMatchObject({
      kind: 'cancelled',
    })
    expect(client.load).not.toHaveBeenCalled()
    expect(marks()).toEqual([oldMark('old-phrase', 5000, 6000)])
  })

  it('does not ask to replace when the voice has no mark', async () => {
    const run = handlers()

    await runTranscription(modelRequest, fakeClient(), run)

    expect(run.confirmReplace).not.toHaveBeenCalled()
  })

  it('reads the range and gives the start of the range as the song time of the first sample', async () => {
    const client = fakeClient()
    const range = { startMs: 10_000, endMs: 20_000 }

    await runTranscription({ ...modelRequest, range }, client, handlers())

    expect(resampleForSpeech).toHaveBeenCalledWith(expect.anything(), range)
    expect(client.transcribe).toHaveBeenCalledWith(
      expect.any(Float32Array),
      10_000,
      expect.anything(),
    )
  })

  it('replaces only the marks inside the range and keeps the marks outside it', async () => {
    useSongStore.getState().closeSong()
    const outside = oldMark('outside', 1000, 2000)
    await openSong([outside, oldMark('inside', 11_000, 12_000)])
    const words: TimedWord[] = [{ text: 'holy', startMs: 12_000, endMs: 12_500 }]
    const run = handlers()

    await runTranscription(
      { ...modelRequest, range: { startMs: 10_000, endMs: 20_000 } },
      fakeClient(words),
      run,
    )

    expect(run.confirmReplace).toHaveBeenCalledOnce()
    expect(labels('phrase').sort()).toEqual(['holy', 'outside'])
    expect(marks()).toContainEqual(outside)
  })

  it('asks to replace when a mark only crosses the start of the range', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('crossing', 8000, 12_000)])
    const run = handlers()

    await runTranscription(
      { ...modelRequest, range: { startMs: 10_000, endMs: 20_000 } },
      fakeClient([{ text: 'holy', startMs: 12_000, endMs: 12_500 }]),
      run,
    )

    expect(run.confirmReplace).toHaveBeenCalledOnce()
    expect(labels('phrase')).toEqual(['holy'])
  })

  it('does not ask to replace for a range with no mark inside it', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('outside', 1000, 2000)])
    const run = handlers()

    await runTranscription(
      { ...modelRequest, range: { startMs: 10_000, endMs: 20_000 } },
      fakeClient([{ text: 'holy', startMs: 12_000, endMs: 12_500 }]),
      run,
    )

    expect(run.confirmReplace).not.toHaveBeenCalled()
  })

  it('keeps the last word of a full-song run inside the song', async () => {
    useSongStore.getState().closeSong()
    const song = await storeNewSong({
      name: 'carol',
      durationMs: 29_990,
      audio,
      voices: [{ id: VOICE, name: 'Lead Vocals', order: 0, color: '#e05d5d' }],
    })
    await useSongStore.getState().openSong(song.id)

    await runTranscription(
      modelRequest,
      fakeClient([{ text: 'night', startMs: 29_400, endMs: 29_990 }]),
      handlers(),
    )

    const wordAndPhrase = marks().filter((mark) => mark.layer !== 'phoneme')
    expect(wordAndPhrase.map((mark) => [mark.startMs, mark.endMs])).toEqual([
      [29_400, 29_950],
      [29_400, 29_950],
    ])
  })

  it('rejects with NoWordsError and writes no mark when the speech model returns no word', async () => {
    await expect(runTranscription(modelRequest, fakeClient([]), handlers())).rejects.toBeInstanceOf(
      NoWordsError,
    )
    expect(marks()).toEqual([])
  })

  it('rejects with NoWordsError when no word keeps a letter or a digit', async () => {
    const result = runTranscription(
      modelRequest,
      fakeClient([{ text: '...', startMs: 100, endMs: 600 }]),
      handlers(),
    )

    await expect(result).rejects.toBeInstanceOf(NoWordsError)
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

  it('rejects as cancelled and writes no mark when the signal aborts during the low-match question', async () => {
    const controller = new AbortController()
    const run = handlers(controller)
    vi.mocked(run.confirmLowMatch).mockImplementation(async () => {
      controller.abort()
      return true
    })

    const result = runTranscription(
      { ...modelRequest, lyrics: 'Away in a manger' },
      fakeClient(),
      run,
    )

    await expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    expect(marks()).toEqual([])
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

describe('runTranscription and the break down', () => {
  it('writes the phonemes of each new word in the same undo step as the words', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('old-phrase', 5000, 6000)])

    await runTranscription(modelRequest, fakeClient(), handlers())

    const words = marks().filter((mark) => mark.layer === 'word')
    for (const word of words) {
      const phonemes = marks().filter((mark) => mark.parentId === word.id)
      expect(phonemes.length).toBeGreaterThan(0)
      expect(phonemes.every((mark) => mark.layer === 'phoneme')).toBe(true)
      expect(phonemes[0]?.startMs).toBe(word.startMs)
      expect(phonemes.at(-1)?.endMs).toBe(word.endMs)
      expect(word.unknown).toBe(false)
    }
    expect(labels('phoneme')).toEqual(['etc', 'AI', 'L', 'AI', 'etc', 'etc', 'AI', 'etc'])
    expect(useSongStore.getState().history.past).toHaveLength(1)

    useSongStore.getState().undo()
    expect(marks()).toEqual([oldMark('old-phrase', 5000, 6000)])
  })

  it('writes the words without phonemes and reports the failure when the dictionary does not load', async () => {
    vi.mocked(loadDictionary).mockRejectedValue(new DictionaryLoadError())

    const outcome = await runTranscription(modelRequest, fakeClient(), handlers())

    const words = marks().filter((mark) => mark.layer === 'word')
    expect(words.map((word) => word.label)).toEqual(['Silent', 'night'])
    expect(labels('phoneme')).toEqual([])
    expect(outcome.breakDownFailure).toEqual({
      message: 'The dictionary did not load. Check the connection and retry.',
      wordIds: words.map((word) => word.id),
    })
  })

  it('writes the words without phonemes and reports the failure when the break down fails for a reason other than the file', async () => {
    vi.mocked(loadDictionary).mockRejectedValue(new TypeError('broken'))

    const outcome = await runTranscription(modelRequest, fakeClient(), handlers())

    const words = marks().filter((mark) => mark.layer === 'word')
    expect(words.map((word) => word.label)).toEqual(['Silent', 'night'])
    expect(labels('phoneme')).toEqual([])
    expect(outcome.breakDownFailure).toEqual({
      message: 'The app could not break down the words. Select Retry.',
      wordIds: words.map((word) => word.id),
    })
  })
})

describe('runTranscription with lyrics only', () => {
  it('spreads the lyrics over the full song and makes no client call', async () => {
    const client = fakeClient()

    const outcome = await runTranscription(lyricsOnly, client, handlers())

    expect(outcome).toEqual({ wordCount: 7, estimatedCount: 7, breakDownFailure: null })
    expect(labels('phrase')).toEqual(['Silent night, holy night', 'All is calm'])
    expect(labels('word')).toEqual(['Silent', 'night', 'holy', 'night', 'All', 'is', 'calm'])
    const phrases = marks().filter((mark) => mark.layer === 'phrase')
    expect(phrases.map((mark) => [mark.startMs, mark.endMs])).toEqual([
      [0, 15_000],
      [15_000, 30_000],
    ])
    expect(client.load).not.toHaveBeenCalled()
    expect(client.transcribe).not.toHaveBeenCalled()
    expect(resampleForSpeech).not.toHaveBeenCalled()
  })

  it('spreads the lyrics over the range only', async () => {
    await runTranscription(
      { ...lyricsOnly, range: { startMs: 10_000, endMs: 20_000 } },
      fakeClient(),
      handlers(),
    )

    const phrases = marks().filter((mark) => mark.layer === 'phrase')
    expect(phrases.map((mark) => [mark.startMs, mark.endMs])).toEqual([
      [10_000, 15_000],
      [15_000, 20_000],
    ])
  })

  it('ends the last word at the last frame multiple inside a range that ends between two frames', async () => {
    await runTranscription(
      { ...lyricsOnly, range: { startMs: 10_000, endMs: 19_990 } },
      fakeClient(),
      handlers(),
    )

    const ends = marks().map((mark) => mark.endMs)
    expect(Math.max(...ends)).toBe(19_950)
  })

  it('starts the first word at the first frame multiple inside a range that starts between two frames', async () => {
    await runTranscription(
      { ...lyricsOnly, range: { startMs: 10_010, endMs: 20_000 } },
      fakeClient(),
      handlers(),
    )

    const starts = marks().map((mark) => mark.startMs)
    expect(Math.min(...starts)).toBe(10_050)
  })

  it('leaves exactly the marks of the second run after two runs over the same range', async () => {
    const request = { ...lyricsOnly, range: { startMs: 10_010, endMs: 19_990 } }
    await runTranscription(request, fakeClient(), handlers())

    await runTranscription(request, fakeClient(), handlers())

    expect(labels('phrase')).toEqual(['Silent night, holy night', 'All is calm'])
    expect(labels('word')).toEqual(['Silent', 'night', 'holy', 'night', 'All', 'is', 'calm'])
  })

  it('asks to replace the marks that exist', async () => {
    useSongStore.getState().closeSong()
    await openSong([oldMark('old-phrase', 5000, 6000)])
    const run = handlers()
    vi.mocked(run.confirmReplace).mockResolvedValue(false)

    await expect(runTranscription(lyricsOnly, fakeClient(), run)).rejects.toMatchObject({
      kind: 'cancelled',
    })
    expect(marks()).toEqual([oldMark('old-phrase', 5000, 6000)])
  })

  it('rejects with NoWordsError for lyrics with no word and does not ask to replace', async () => {
    const run = handlers()

    await expect(
      runTranscription({ ...modelRequest, mode: 'lyrics-only' }, fakeClient(), run),
    ).rejects.toBeInstanceOf(NoWordsError)
    expect(run.confirmReplace).not.toHaveBeenCalled()
  })
})
