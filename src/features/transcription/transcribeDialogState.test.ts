import { describe, expect, it } from 'vitest'
import { NoWordsError } from './runTranscription.ts'
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
  progressText,
  progressValue,
  runSpeed,
  shownRunState,
  speedText,
  stateLabel,
  deviceLine,
  isRunState,
  transcribeDialogReducer as reduce,
  wholePercent,
} from './transcribeDialogState.ts'

const transcribing: DialogState = { status: 'transcribing', doneMs: 0, totalMs: 220_000 }

describe('progressText', () => {
  it('shows the download percent', () => {
    expect(progressText({ status: 'downloading', percent: 42 }, 5000)).toBe(
      'Downloading speech model, 42%',
    )
  })

  it('shows the audio time that is complete and the audio time of the run', () => {
    expect(progressText({ status: 'transcribing', doneMs: 72_000, totalMs: 220_000 }, 0)).toBe(
      'Transcribing, 1:12 of 3:40',
    )
  })

  it('shows the align step', () => {
    expect(progressText({ status: 'finishing' }, 0)).toBe('Aligning lyrics and breaking down words')
  })

  it.each([
    [{ status: 'preparing' } as const, 'Preparing audio, 0:03 elapsed'],
    [{ status: 'loading' } as const, 'Loading speech model, 0:03 elapsed'],
    [{ status: 'started' } as const, 'Transcribing, 0:03 elapsed'],
  ])('shows the elapsed time for %o', (state, text) => {
    expect(progressText(state, 3999)).toBe(text)
  })

  it('shows minutes in the elapsed time', () => {
    expect(progressText({ status: 'started' }, 72_000)).toBe('Transcribing, 1:12 elapsed')
  })
})

describe('stateLabel', () => {
  it('names each run state without its numbers, for the live region', () => {
    expect(stateLabel({ status: 'preparing' })).toBe('Preparing audio')
    expect(stateLabel({ status: 'loading' })).toBe('Loading speech model')
    expect(stateLabel({ status: 'downloading', percent: 42 })).toBe('Downloading speech model')
    expect(stateLabel({ status: 'started' })).toBe('Transcribing')
    expect(stateLabel({ status: 'transcribing', doneMs: 1, totalMs: 2 })).toBe('Transcribing')
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
    expect(outcomeText({ wordCount: 214, estimatedCount: 9 })).toBe('214 words, 9 estimated')
  })

  it('shows one word in the singular', () => {
    expect(outcomeText({ wordCount: 1, estimatedCount: 1 })).toBe('1 word, 1 estimated')
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
    const asking = reduce(transcribing, { type: 'confirm-replace' })
    expect(asking).toEqual({ status: 'confirm-replace', resume: transcribing })
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
    const asking = reduce(transcribing, { type: 'confirm-replace' })

    expect(reduce(asking, { type: 'confirm-replace' })).toBe(asking)
    expect(reduce(asking, { type: 'confirm-low-match', ratio: 0.1 })).toBe(asking)
  })

  it('keeps a run state for an answer with no question', () => {
    expect(reduce(transcribing, { type: 'answer' })).toBe(transcribing)
  })

  it('goes back to idle when the person cancels the run', () => {
    expect(reduce(transcribing, { type: 'cancelled' })).toEqual(IDLE)
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
    expect(isActive({ status: 'confirm-replace', resume: transcribing })).toBe(true)
    expect(isActive(IDLE)).toBe(false)
    expect(isActive({ status: 'error', message: '' })).toBe(false)
    expect(isActive({ status: 'done' })).toBe(false)
  })

  it('shows no run state when no run is active', () => {
    expect(shownRunState(IDLE)).toBeNull()
  })
})
