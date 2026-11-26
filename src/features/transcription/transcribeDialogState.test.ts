import { describe, expect, it } from 'vitest'
import { RemoteError } from '../../lib/remote/response.ts'
import { DEFAULT_SETTINGS } from '../../store/settings.ts'
import { NoSplitWordsError, NoWordsError } from './runTranscription.ts'
import { TranscribeError } from './transcribeClient.ts'
import {
  type DialogState,
  downloadPercent,
  ERROR_COPY,
  errorMessage,
  IDLE,
  isActive,
  isCancel,
  lowMatchMessage,
  outcomeText,
  lyricsFitMessage,
  replaceQuestionMessage,
  progressText,
  progressValue,
  remoteErrorMessage,
  runSpeed,
  shownRunState,
  speedText,
  stateLabel,
  deviceLine,
  isRunState,
  keepTracksNote,
  transcribeDialogReducer as reduce,
  wholePercent,
  withPersonChoices,
} from './transcribeDialogState.ts'

const transcribing: DialogState = { status: 'transcribing', doneMs: 0, totalMs: 220_000 }
const QUESTION = { markCount: 12, voiceName: 'Lead Vocals', range: { startMs: 0, endMs: 28_900 } }

describe('progressText', () => {
  it('shows the download percent', () => {
    expect(progressText({ status: 'downloading', percent: 42 }, 5000, '')).toBe(
      'Downloading speech model, 42%',
    )
  })

  it('shows the audio time that is complete and the audio time of the run', () => {
    expect(progressText({ status: 'transcribing', doneMs: 72_000, totalMs: 220_000 }, 0, '')).toBe(
      'Transcribing, 1:12 of 3:40',
    )
  })

  it('shows the align step', () => {
    expect(progressText({ status: 'finishing' }, 0, '')).toBe(
      'Aligning lyrics and breaking down words',
    )
  })

  it.each([
    [{ status: 'preparing' } as const, 'Preparing audio, 0:03 elapsed'],
    [{ status: 'loading' } as const, 'Loading speech model, 0:03 elapsed'],
    [{ status: 'started' } as const, 'Transcribing, 0:03 elapsed'],
  ])('shows the elapsed time for %o', (state, text) => {
    expect(progressText(state, 3999, '')).toBe(text)
  })

  it('shows minutes in the elapsed time', () => {
    expect(progressText({ status: 'started' }, 72_000, '')).toBe('Transcribing, 1:12 elapsed')
  })
})

describe('stateLabel', () => {
  it('names each run state without its numbers, for the live region', () => {
    expect(stateLabel({ status: 'preparing' }, '')).toBe('Preparing audio')
    expect(stateLabel({ status: 'loading' }, '')).toBe('Loading speech model')
    expect(stateLabel({ status: 'downloading', percent: 42 }, '')).toBe('Downloading speech model')
    expect(stateLabel({ status: 'started' }, '')).toBe('Transcribing')
    expect(stateLabel({ status: 'transcribing', doneMs: 1, totalMs: 2 }, '')).toBe('Transcribing')
  })
})

describe('runSpeed', () => {
  it('returns no speed before the end of the first chunk', () => {
    expect(runSpeed(25_000, 220_000, 10_000)).toBeNull()
  })

  it('returns the speed from the end of the first chunk', () => {
    expect(runSpeed(30_000, 220_000, 15_000)).toEqual({ audioMs: 30_000, runMs: 15_000 })
  })

  it('returns the speed at the end of a run shorter than one chunk', () => {
    expect(runSpeed(28_900, 28_900, 9000)).toEqual({ audioMs: 28_900, runMs: 9000 })
  })

  it('returns no speed for a run time of 0', () => {
    expect(runSpeed(30_000, 220_000, 0)).toBeNull()
  })
})

describe('speedText and deviceLine', () => {
  it('rounds the seconds of audio for each second of the run', () => {
    expect(speedText({ audioMs: 30_000, runMs: 14_000 })).toBe('about 2 times faster than the song')
  })

  it('shows a run slower than the song', () => {
    expect(speedText({ audioMs: 30_000, runMs: 95_000 })).toBe('about 3 times slower than the song')
  })

  it('shows a run near the speed of the song', () => {
    expect(speedText({ audioMs: 30_000, runMs: 36_000 })).toBe('about as fast as the song')
    expect(speedText({ audioMs: 30_000, runMs: 24_000 })).toBe('about as fast as the song')
  })

  it('names the device, and adds the speed after the first chunk', () => {
    expect(deviceLine('webgpu', null)).toBe('Graphics card (WebGPU)')
    expect(deviceLine('wasm', null)).toBe('CPU')
    expect(deviceLine('wasm', { audioMs: 30_000, runMs: 15_000 })).toBe(
      'CPU, about 2 times faster than the song',
    )
  })
})

describe('progressValue', () => {
  it('returns the download percent as a fraction', () => {
    expect(progressValue({ status: 'downloading', percent: 42 })).toBe(0.42)
  })

  it('returns the complete part of the audio', () => {
    expect(progressValue({ status: 'transcribing', doneMs: 55_000, totalMs: 220_000 })).toBe(0.25)
  })

  it('returns at most 1 when the last chunk ends after the audio', () => {
    expect(progressValue({ status: 'transcribing', doneMs: 30_000, totalMs: 28_900 })).toBe(1)
  })

  it('returns 0 for a run with no audio time', () => {
    expect(progressValue({ status: 'transcribing', doneMs: 0, totalMs: 0 })).toBe(0)
  })

  it('returns no value for the align step', () => {
    expect(progressValue({ status: 'finishing' })).toBeUndefined()
  })
})

describe('wholePercent and downloadPercent', () => {
  it('rounds down, so 0.29 shows as 29', () => {
    expect(wholePercent(0.29)).toBe(29)
    expect(wholePercent(0.299)).toBe(29)
  })

  it('keeps the percent from 0 to 100', () => {
    expect(wholePercent(-0.1)).toBe(0)
    expect(wholePercent(1.2)).toBe(100)
  })

  it('returns the downloaded part of the bytes', () => {
    expect(downloadPercent(500_000, 1_000_000)).toBe(50)
  })

  it('returns 0 before the total is known', () => {
    expect(downloadPercent(0, 0)).toBe(0)
  })
})

describe('errorMessage', () => {
  it('shows the download copy for a download failure', () => {
    expect(errorMessage(new TranscribeError('download', 'x'))).toBe(
      'The speech model did not download. Check the connection and retry.',
    )
  })

  it('shows the memory copy for an out-of-memory failure', () => {
    expect(errorMessage(new TranscribeError('memory', 'x'))).toBe(
      'This browser ran out of memory. Select a smaller speech model.',
    )
  })

  it('shows the singer split no-words copy when the singer tracks give no word', () => {
    expect(errorMessage(new NoSplitWordsError())).toBe(
      'The singer tracks have no sound that the speech model can transcribe, so the run found no words. Turn off "Split the singers" and select Retry.',
    )
  })

  it('shows the no-words copy when the run finds no word', () => {
    expect(errorMessage(new NoWordsError())).toBe(
      'No words were found. Paste the lyrics and use Lyrics only.',
    )
  })

  it('shows the transcribe-failed copy for any other failure', () => {
    expect(errorMessage(new TranscribeError('device', 'x'))).toBe(ERROR_COPY.failed)
    expect(errorMessage(new TranscribeError('unknown', 'x'))).toBe(ERROR_COPY.failed)
    expect(errorMessage(new Error('decode'))).toBe(ERROR_COPY.failed)
  })
})

describe('lowMatchMessage', () => {
  it('shows the match ratio as a whole percent', () => {
    expect(lowMatchMessage(0.22)).toBe(
      'Only 22% of the lyrics matched the audio. Check that the lyrics belong to this song.',
    )
  })
})

describe('outcomeText', () => {
  it('shows the word count and the estimated count', () => {
    expect(outcomeText({ wordCount: 214, estimatedCount: 9, runData: 'stored' })).toBe(
      '214 words, 9 estimated',
    )
  })

  it('shows one word in the singular', () => {
    expect(outcomeText({ wordCount: 1, estimatedCount: 1, runData: 'stored' })).toBe(
      '1 word, 1 estimated',
    )
  })
})

describe('replaceQuestionMessage', () => {
  it('states the count of marks, the voice and the range', () => {
    expect(replaceQuestionMessage(QUESTION)).toBe(
      'The run replaces the 12 marks of "Lead Vocals" from 0:00.000 to 0:28.900.',
    )
  })

  it('states one mark in the singular', () => {
    expect(replaceQuestionMessage({ ...QUESTION, markCount: 1 })).toBe(
      'The run replaces the 1 mark of "Lead Vocals" from 0:00.000 to 0:28.900.',
    )
  })

  it('names each singer voice of the last run that loses marks, with the sum of the marks', () => {
    expect(
      replaceQuestionMessage({ ...QUESTION, markCount: 30, singerVoiceNames: ['Singer 2'] }),
    ).toBe(
      'The run replaces 30 marks from 0:00.000 to 0:28.900: the marks of "Lead Vocals", and the marks of "Singer 2" from the last run.',
    )
    expect(
      replaceQuestionMessage({
        ...QUESTION,
        markCount: 1,
        singerVoiceNames: ['Singer 2', 'Test Alto', 'Singer 4'],
      }),
    ).toBe(
      'The run replaces 1 mark from 0:00.000 to 0:28.900: the marks of "Lead Vocals", and the marks of "Singer 2", "Test Alto" and "Singer 4" from the last run.',
    )
  })

  it('states that the singer voices of the last run do not change', () => {
    expect(replaceQuestionMessage({ ...QUESTION, singerVoicesKept: true })).toBe(
      'The run replaces the 12 marks of "Lead Vocals" from 0:00.000 to 0:28.900. The singer voices of the last run do not change.',
    )
  })
})

describe('outcomeText after a run that left out words', () => {
  it('states the count of words that the app left out', () => {
    expect(
      outcomeText({ wordCount: 10, estimatedCount: 10, runData: 'stored', wordsLeftOut: 3 }),
    ).toBe('10 words, 10 estimated. The app left out 3 words that it cannot use.')
  })

  it('states one word in the singular', () => {
    expect(
      outcomeText({ wordCount: 10, estimatedCount: 10, runData: 'stored', wordsLeftOut: 1 }),
    ).toBe('10 words, 10 estimated. The app left out 1 word that it cannot use.')
  })

  it('states nothing for a count of 0', () => {
    expect(
      outcomeText({ wordCount: 10, estimatedCount: 10, runData: 'stored', wordsLeftOut: 0 }),
    ).toBe('10 words, 10 estimated')
  })
})

describe('outcomeText after a run that could not keep the tracks', () => {
  it('adds the sentence that the app could not keep the separated tracks', () => {
    expect(
      outcomeText({ wordCount: 214, estimatedCount: 9, runData: 'stored', tracksFailed: true }),
    ).toBe(
      '214 words, 9 estimated. The app could not keep the separated tracks. Run "Transcribe" again to try one more time.',
    )
  })

  it('puts the tracks sentence before the sentence of the run data', () => {
    expect(
      outcomeText({ wordCount: 2, estimatedCount: 0, runData: 'failed', tracksFailed: true }),
    ).toBe(
      '2 words, 0 estimated. The app could not keep the separated tracks. Run "Transcribe" again to try one more time. The app could not store the run report.',
    )
  })
})

describe('outcomeText after a write of the run data that was not complete', () => {
  it('adds the storage full sentence when the app kept no tracks', () => {
    expect(outcomeText({ wordCount: 214, estimatedCount: 9, runData: 'storage-full' })).toBe(
      '214 words, 9 estimated. The browser storage is full, so the app did not keep the separated tracks.',
    )
  })

  it('adds the sentence of a run report that the app did not store', () => {
    expect(outcomeText({ wordCount: 214, estimatedCount: 9, runData: 'failed' })).toBe(
      '214 words, 9 estimated. The app could not store the run report.',
    )
  })

  it('adds the sentence of a run report that the app still stores after the time limit', () => {
    expect(outcomeText({ wordCount: 214, estimatedCount: 9, runData: 'late' })).toBe(
      '214 words, 9 estimated. The app still stores the run report. It shows in "Run report" when it is ready.',
    )
  })
})

describe('keepTracksNote', () => {
  it('states the megabytes of the two tracks for the length of the run', () => {
    expect(keepTracksNote(180_000)).toBe(
      'The app stores the vocals and the instruments of this song in this browser, about 15 MB. You can listen to each track in the editor.',
    )
    expect(keepTracksNote(30_000)).toContain('about 2.5 MB.')
  })
})

describe('isCancel', () => {
  it('returns true only for a cancelled run', () => {
    expect(isCancel(new TranscribeError('cancelled', 'x'))).toBe(true)
    expect(isCancel(new TranscribeError('unknown', 'x'))).toBe(false)
    expect(isCancel(new Error('x'))).toBe(false)
  })
})

describe('transcribeDialogReducer', () => {
  it('starts a speech model run at the audio preparation', () => {
    expect(reduce(IDLE, { type: 'start', mode: 'model' })).toEqual({ status: 'preparing' })
  })

  it('goes through the steps before the first progress, then to the progress', () => {
    const preparing = reduce(IDLE, { type: 'start', mode: 'model' })
    const loading = reduce(preparing, { type: 'stage', stage: 'loading' })
    expect(loading).toEqual({ status: 'loading' })
    const started = reduce(loading, { type: 'stage', stage: 'transcribing' })
    expect(started).toEqual({ status: 'started' })
    expect(isRunState(started)).toBe(true)
    expect(progressValue({ status: 'started' })).toBeUndefined()

    expect(reduce(started, { type: 'progress', doneMs: 5000, totalMs: 220_000 })).toEqual({
      status: 'transcribing',
      doneMs: 5000,
      totalMs: 220_000,
    })
  })

  it('goes back to the model load when the run moves to wasm', () => {
    expect(reduce(transcribing, { type: 'stage', stage: 'loading' })).toEqual({ status: 'loading' })
  })

  it('goes from the model load to the download', () => {
    expect(reduce({ status: 'loading' }, { type: 'download', percent: 0 })).toEqual({
      status: 'downloading',
      percent: 0,
    })
  })

  it('starts a lyrics-only run at the align step', () => {
    expect(reduce(IDLE, { type: 'start', mode: 'lyrics-only' })).toEqual({
      status: 'finishing',
    })
  })

  it('goes from the download to the progress of the run', () => {
    const downloading = reduce(transcribing, { type: 'download', percent: 42 })
    expect(downloading).toEqual({ status: 'downloading', percent: 42 })

    expect(reduce(downloading, { type: 'progress', doneMs: 20_000, totalMs: 220_000 })).toEqual({
      status: 'transcribing',
      doneMs: 20_000,
      totalMs: 220_000,
    })
  })

  it('goes to the align step', () => {
    expect(reduce(transcribing, { type: 'finishing' })).toEqual({ status: 'finishing' })
  })

  it('asks to replace the marks and goes back to the run after the answer', () => {
    const asking = reduce(transcribing, { type: 'confirm-replace', question: QUESTION })
    expect(asking).toEqual({ status: 'confirm-replace', question: QUESTION, resume: transcribing })
    expect(shownRunState(asking)).toEqual(transcribing)

    expect(reduce(asking, { type: 'answer' })).toEqual(transcribing)
  })

  it('shows the low-match warning and goes back to the run after the answer', () => {
    const finishing: DialogState = { status: 'finishing' }
    const asking = reduce(finishing, { type: 'confirm-low-match', ratio: 0.22 })
    expect(asking).toEqual({ status: 'low-match', ratio: 0.22, resume: finishing })

    expect(reduce(asking, { type: 'answer' })).toEqual(finishing)
  })

  it('asks no second question while a question waits for an answer', () => {
    const asking = reduce(transcribing, { type: 'confirm-replace', question: QUESTION })

    expect(reduce(asking, { type: 'confirm-replace', question: QUESTION })).toBe(asking)
    expect(reduce(asking, { type: 'confirm-low-match', ratio: 0.1 })).toBe(asking)
  })

  it('keeps a run state for an answer with no question', () => {
    expect(reduce(transcribing, { type: 'answer' })).toBe(transcribing)
  })

  it('goes back to idle with the stopped message when the person cancels the run', () => {
    const stopped = reduce(transcribing, { type: 'cancelled' })
    expect(stopped).toEqual({ status: 'idle', stopped: true })
    expect(reduce(stopped, { type: 'clear-stopped' })).toEqual(IDLE)
  })

  it('keeps a run state when the timer of the stopped message ends late', () => {
    expect(reduce(transcribing, { type: 'clear-stopped' })).toBe(transcribing)
  })

  it('shows the message of a failure', () => {
    expect(
      reduce(transcribing, { type: 'failed', error: new TranscribeError('download', 'x') }),
    ).toEqual({ status: 'error', message: ERROR_COPY.download })
  })

  it('goes to done when the run ends well', () => {
    expect(reduce(transcribing, { type: 'done' })).toEqual({ status: 'done' })
  })

  it('ignores a run event after the run stopped', () => {
    expect(reduce(IDLE, { type: 'progress', doneMs: 1000, totalMs: 2000 })).toBe(IDLE)
    const error: DialogState = { status: 'error', message: ERROR_COPY.failed }
    expect(reduce(error, { type: 'download', percent: 5 })).toBe(error)
  })

  it('starts again from the error state for "Retry"', () => {
    const error: DialogState = { status: 'error', message: ERROR_COPY.failed }

    expect(reduce(error, { type: 'start', mode: 'model' })).toEqual({ status: 'preparing' })
  })
})

describe('isActive and shownRunState', () => {
  it('treats the run states and the confirm states as active', () => {
    expect(isActive(transcribing)).toBe(true)
    expect(isActive({ status: 'confirm-replace', question: QUESTION, resume: transcribing })).toBe(
      true,
    )
    expect(isActive(IDLE)).toBe(false)
    expect(isActive({ status: 'error', message: '' })).toBe(false)
    expect(isActive({ status: 'done' })).toBe(false)
  })

  it('shows no run state when no run is active', () => {
    expect(shownRunState(IDLE)).toBeNull()
  })
})

describe('the states of a remote run', () => {
  const HOST = 'localhost:8000'

  it('names the host in the sending and waiting states', () => {
    expect(stateLabel({ status: 'sending', percent: 42 }, HOST)).toBe(
      'Sending audio to localhost:8000',
    )
    expect(stateLabel({ status: 'waiting' }, HOST)).toBe('Waiting for localhost:8000')
  })

  it('shows the upload percent when the browser reports it', () => {
    expect(progressText({ status: 'sending', percent: 42 }, 5000, HOST)).toBe(
      'Sending audio to localhost:8000, 42%',
    )
    expect(progressValue({ status: 'sending', percent: 42 })).toBe(0.42)
  })

  it('shows the elapsed time before the first upload progress and during the wait', () => {
    expect(progressText({ status: 'sending', percent: null }, 3999, HOST)).toBe(
      'Sending audio to localhost:8000, 0:03 elapsed',
    )
    expect(progressText({ status: 'waiting' }, 72_000, HOST)).toBe(
      'Waiting for localhost:8000, 1:12 elapsed',
    )
    expect(progressValue({ status: 'sending', percent: null })).toBeUndefined()
    expect(progressValue({ status: 'waiting' })).toBeUndefined()
  })

  it('moves from preparing to sending, to the upload percent, then to waiting', () => {
    let state = reduce(IDLE, { type: 'start', mode: 'model' })
    state = reduce(state, { type: 'stage', stage: 'sending' })
    expect(state).toEqual({ status: 'sending', percent: null })
    state = reduce(state, { type: 'upload', percent: 50 })
    expect(state).toEqual({ status: 'sending', percent: 50 })
    expect(isRunState(state)).toBe(true)
    state = reduce(state, { type: 'stage', stage: 'waiting' })
    expect(state).toEqual({ status: 'waiting' })
    expect(isActive(state)).toBe(true)
  })
})

describe('remoteErrorMessage', () => {
  const HOST = 'ai.example.com'
  const ORIGIN = 'https://timing.example.com'

  it.each([
    [
      new RemoteError('network', HOST),
      'The app could not connect to ai.example.com. Check that the server runs and that the base URL is correct.\n\nIf the server runs: its CORS settings can block this page. Check that the server sends the header Access-Control-Allow-Origin: https://timing.example.com',
    ],
    [
      new RemoteError('auth', HOST, 401),
      'ai.example.com refused the API key (HTTP 401). Check the API key of the remote endpoint.',
    ],
    [
      new RemoteError('auth', HOST, 403),
      'ai.example.com refused the API key (HTTP 403). Check the API key of the remote endpoint.',
    ],
    [
      new RemoteError('not-found', HOST, 404),
      'ai.example.com has no transcription service at this address (HTTP 404). Check the base URL. It usually ends with /v1.',
    ],
    [
      new RemoteError('too-large', HOST),
      'The audio is too large for the remote endpoint. Select a shorter part of the song in the editor, and transcribe the time selection.',
    ],
    [
      new RemoteError('rate-limit', HOST, 429),
      'ai.example.com received too many requests (HTTP 429). Wait one minute, then select Retry.',
    ],
    [
      new RemoteError('server', HOST, 502),
      'ai.example.com reported an error (HTTP 502). Check the server, then select Retry.',
    ],
    [
      new RemoteError('refused', HOST, 400),
      'ai.example.com refused the request (HTTP 400). Check the speech model name of the remote endpoint.',
    ],
    [
      new RemoteError('not-json', HOST, 200),
      'ai.example.com did not return JSON. Check the base URL. It usually ends with /v1.',
    ],
    [
      new RemoteError('no-word-times', HOST),
      'ai.example.com returned no word times. Use a server and a speech model that return the words field of verbose_json.',
    ],
  ])('returns the copy for %s', (error, text) => {
    expect(remoteErrorMessage(error, ORIGIN)).toBe(text)
  })

  it('gives the origin of the page to the network message of a failed run', () => {
    expect(errorMessage(new RemoteError('network', HOST))).toContain(
      `Access-Control-Allow-Origin: ${globalThis.location.origin}`,
    )
  })
})

describe('lyricsFitMessage', () => {
  const fit = { wordCount: 700, room: 600, keptLineCount: 1, lineCount: 1, firstLineCut: true }

  it('names line 1 when line 1 alone does not fit', () => {
    expect(lyricsFitMessage(fit, false)).toBe(
      'The lyrics have 700 words. This song has room for about 600 words. The app leaves out the words of line 1 that do not fit.',
    )
  })

  it('names line 1 and the lines after it when line 1 does not fit and more lines follow', () => {
    expect(lyricsFitMessage({ ...fit, wordCount: 710, lineCount: 3 }, true)).toBe(
      'The lyrics have 710 words. The time selection has room for about 600 words. The app leaves out the words of line 1 that do not fit, and the lines after line 1.',
    )
  })
})

describe('withPersonChoices', () => {
  const stored = {
    ...DEFAULT_SETTINGS,
    speechModelId: 'whisper-tiny',
    separateVocals: true,
    singerVoices: true,
  }

  it('keeps each choice that the person made while the read ran', () => {
    const shown = withPersonChoices(stored, { speechModelId: 'whisper-small', singerVoices: false })

    expect(shown.speechModelId).toBe('whisper-small')
    expect(shown.singerVoices).toBe(false)
  })

  it('takes the stored value of each setting that the person did not change', () => {
    const shown = withPersonChoices(stored, { singerVoices: false })

    expect(shown).toEqual({ ...stored, singerVoices: false })
  })

  it('returns the stored settings when the person changed nothing', () => {
    expect(withPersonChoices(stored, {})).toEqual(stored)
  })
})
