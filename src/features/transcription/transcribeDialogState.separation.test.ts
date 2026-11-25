import { describe, expect, it } from 'vitest'
import { SeparateError } from '../vocal-separation/separateClient.ts'
import {
  DEMUCS_WASM_WARNING,
  type DialogState,
  IDLE,
  progressText,
  progressValue,
  type RunState,
  SEPARATION_COPY,
  separationErrorMessage,
  separationModelLabel,
  separationNote,
  shownRunState,
  stateLabel,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

const PREPARING: DialogState = { status: 'preparing' }

describe('the separation states of the transcribe dialog', () => {
  it('shows "Loading vocal separation model" with the elapsed time at the step separation-download', () => {
    const state = transcribeDialogReducer(PREPARING, {
      type: 'stage',
      stage: 'separation-download',
    }) as RunState

    expect(state).toEqual({ status: 'separation-loading' })
    expect(progressText(state, 3000, '')).toBe('Loading vocal separation model, 0:03 elapsed')
    expect(progressValue(state)).toBeUndefined()
  })

  it('shows "Downloading vocal separation model, N%" with the progress bar', () => {
    const state = transcribeDialogReducer(PREPARING, {
      type: 'separation-download',
      percent: 40,
    }) as RunState

    expect(progressText(state, 3000, '')).toBe('Downloading vocal separation model, 40%')
    expect(progressValue(state)).toBe(0.4)
  })

  it('shows "Separating vocals" with the elapsed time at the step separating', () => {
    const state = transcribeDialogReducer(PREPARING, {
      type: 'stage',
      stage: 'separating',
    }) as RunState

    expect(progressText(state, 12_000, '')).toBe('Separating vocals, 0:12 elapsed')
    expect(stateLabel(state, '')).toBe('Separating vocals')
  })

  it('shows "Separating vocals, m:ss of m:ss" with the progress bar and the elapsed time', () => {
    const state = transcribeDialogReducer(PREPARING, {
      type: 'separation-progress',
      doneMs: 72_000,
      totalMs: 220_000,
    }) as RunState

    expect(progressText(state, 45_000, '')).toBe('Separating vocals, 1:12 of 3:40, 0:45 elapsed')
    expect(progressValue(state)).toBeCloseTo(72 / 220)
  })

  it('gives a bar value of 0 for an empty separation', () => {
    expect(progressValue({ status: 'separating', doneMs: 0, totalMs: 0 })).toBe(0)
  })

  it('asks the person after a failure and shows the progress of the run that waits', () => {
    const running: DialogState = { status: 'separating', doneMs: 1000, totalMs: 2000 }

    const state = transcribeDialogReducer(running, {
      type: 'confirm-no-separation',
      error: new SeparateError('memory', 'RangeError'),
    })

    expect(state).toEqual({
      status: 'separation-failed',
      message: SEPARATION_COPY.memory,
      fastModel: false,
      resume: running,
    })
    expect(shownRunState(state)).toEqual(running)
    expect(transcribeDialogReducer(state, { type: 'answer' })).toEqual(running)
    expect(transcribeDialogReducer(state, { type: 'cancelled' })).toEqual(IDLE)
  })

  it('ignores a separation event after the run stopped', () => {
    expect(transcribeDialogReducer(IDLE, { type: 'separation-download', percent: 5 })).toBe(IDLE)
    expect(
      transcribeDialogReducer(IDLE, { type: 'confirm-no-separation', error: new Error('x') }),
    ).toBe(IDLE)
  })

  it('keeps the state when a failure arrives during another question', () => {
    const question: DialogState = { status: 'confirm-replace', resume: { status: 'preparing' } }

    expect(
      transcribeDialogReducer(question, { type: 'confirm-no-separation', error: new Error('x') }),
    ).toBe(question)
  })
})

describe('separationErrorMessage', () => {
  it.each([
    [
      'download',
      'The app could not download the vocal separation model. Check the connection. Then try again, or continue with no separation.',
    ],
    [
      'memory',
      'This browser does not have enough memory to separate the vocals of this song. Select a shorter time range, or continue with no separation.',
    ],
    ['model', 'The vocal separation did not work. Continue with no separation, or cancel.'],
    ['unknown', 'The vocal separation did not work. Continue with no separation, or cancel.'],
  ] as const)('returns the copy of the cause %s', (kind, message) => {
    expect(separationErrorMessage(new SeparateError(kind, 'detail'))).toBe(message)
  })

  it('returns the general copy for a failure that is not a SeparateError', () => {
    expect(separationErrorMessage(new Error('EncodingError'))).toBe(SEPARATION_COPY.failed)
  })
})

describe('separationNote', () => {
  it('tells that the audio stays in this browser for a run in the browser', () => {
    expect(separationNote(null)).toBe(
      'The app removes the instruments before it finds the words. This step downloads a model of 79 MB one time and adds time to the run. The audio stays in this browser.',
    )
  })

  it('names the host of the remote endpoint for a remote run', () => {
    expect(separationNote('whisper.test')).toBe(
      'The app removes the instruments before it finds the words. This step downloads a model of 79 MB one time and adds time to the run. The app separates the vocals in this browser, and then sends the vocals to whisper.test.',
    )
  })
})

describe('the separation model of the transcribe dialog', () => {
  const running: RunState = { status: 'separating', doneMs: 1000, totalMs: 2000 }

  it('labels each model choice with the download size of the model list', () => {
    expect(separationModelLabel('spleeter')).toBe('Fast (Spleeter, 79 MB)')
    expect(separationModelLabel('demucs')).toBe('Demucs, experimental (181 MB, much slower)')
  })

  it('states the download size of the selected model in the note', () => {
    expect(separationNote(null, 'demucs')).toContain('downloads a model of 181 MB one time')
    expect(separationNote(null)).toContain('downloads a model of 79 MB one time')
  })

  it('names Demucs in the load and download steps of a Demucs run', () => {
    expect(progressText({ status: 'separation-loading' }, 3000, '', 'demucs')).toBe(
      'Loading Demucs vocal separation model, 0:03 elapsed',
    )
    expect(stateLabel({ status: 'separation-downloading', percent: 42 }, '', 'demucs')).toBe(
      'Downloading Demucs vocal separation model',
    )
  })

  it('has the warning text of the feature file', () => {
    expect(DEMUCS_WASM_WARNING).toBe(
      'Demucs needs about 4 GB of memory and several minutes for a song on this browser.',
    )
  })

  it('offers the fast model after a memory failure of Demucs', () => {
    const state = transcribeDialogReducer(running, {
      type: 'confirm-no-separation',
      error: new SeparateError('memory', 'std::bad_alloc'),
      model: 'demucs',
    })

    expect(state).toMatchObject({ status: 'separation-failed', fastModel: true })
    expect(state).toMatchObject({ message: SEPARATION_COPY.memory })
  })

  it.each<['spleeter' | 'demucs', 'memory' | 'model']>([
    ['spleeter', 'memory'],
    ['demucs', 'model'],
  ])('does not offer the fast model after a %s failure of kind %s', (model, kind) => {
    const state = transcribeDialogReducer(running, {
      type: 'confirm-no-separation',
      error: new SeparateError(kind, 'detail'),
      model,
    })

    expect(state).toMatchObject({ status: 'separation-failed', fastModel: false })
  })
})
