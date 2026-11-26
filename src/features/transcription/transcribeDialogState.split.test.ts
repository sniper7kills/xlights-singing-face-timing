import { describe, expect, it } from 'vitest'
import { SplitError } from '../singer-split/splitClient.ts'
import { NoSplitRoomError } from './splitRun.ts'
import {
  errorMessage,
  outcomeText,
  progressText,
  SPLIT_COPY,
  splitRemoteNote,
  stateLabel,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

const RUNNING = { status: 'preparing' } as const

describe('the transcribe dialog state with the singer split', () => {
  it('shows the load of the singer split model with the elapsed time', () => {
    const state = transcribeDialogReducer(RUNNING, { type: 'stage', stage: 'split-download' })

    expect(state).toEqual({ status: 'split-loading' })
    if (state.status !== 'split-loading') throw new Error('No run state.')
    expect(progressText(state, 12_000, '')).toBe('Loading singer split model, 0:12 elapsed')
  })

  it('shows the download and the split with a percent', () => {
    const downloading = transcribeDialogReducer(RUNNING, { type: 'split-download', percent: 40 })
    const splitting = transcribeDialogReducer(downloading, { type: 'split-progress', percent: 75 })

    expect(downloading).toEqual({ status: 'split-downloading', percent: 40 })
    expect(splitting).toEqual({ status: 'splitting', percent: 75 })
    if (splitting.status !== 'splitting') throw new Error('No run state.')
    expect(progressText(splitting, 0, '')).toBe('Splitting the singers, 75%')
    expect(stateLabel(splitting, '')).toBe('Splitting the singers')
  })

  it('starts the split at 0% at the first progress of the step', () => {
    const state = transcribeDialogReducer(RUNNING, { type: 'stage', stage: 'splitting' })

    expect(state).toEqual({ status: 'splitting', percent: 0 })
  })

  it('states the cause and the next action of each failure of the split', () => {
    expect(errorMessage(new SplitError('download', 'x'))).toBe(SPLIT_COPY.download)
    expect(errorMessage(new SplitError('memory', 'x'))).toBe(SPLIT_COPY.memory)
    expect(errorMessage(new SplitError('not-available', 'x'))).toBe(SPLIT_COPY['not-available'])
    expect(errorMessage(new SplitError('model', 'x'))).toBe(SPLIT_COPY.failed)
    expect(errorMessage(new SplitError('unknown', 'x'))).toBe(SPLIT_COPY.failed)
    expect(errorMessage(new NoSplitRoomError())).toBe(
      'A song has 12 voices at most, and the singer split adds 2 voices. Delete a voice, or turn off "Split the singers".',
    )
  })

  it('names the two voices in the toast of a split run', () => {
    const text = outcomeText({
      wordCount: 16,
      estimatedCount: 0,
      split: { status: 'split', voiceNames: ['Female', 'Male'] },
      runData: 'stored',
    })

    expect(text).toBe('16 words on 2 voices, 0 estimated')
  })

  it('states in the toast that the split did not run with no separated vocals', () => {
    const text = outcomeText({
      wordCount: 16,
      estimatedCount: 0,
      split: { status: 'no-vocals', voiceName: 'Lead Vocals' },
      runData: 'stored',
    })

    expect(text).toBe(
      '16 words, 0 estimated. The app splits the singers only in separated vocals. All phrases stay on Lead Vocals.',
    )
  })

  it('states that a remote run sends two requests', () => {
    expect(splitRemoteNote('stt.example')).toBe(
      'The app sends two requests to stt.example, one for each singer track. The audio of both tracks leaves this computer.',
    )
  })
})
