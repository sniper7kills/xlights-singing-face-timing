import { describe, expect, it } from 'vitest'
import type { SingerOutcome } from './runTranscription.ts'
import {
  type DialogState,
  outcomeText,
  progressText,
  progressValue,
  type RunState,
  singerMessage,
  stateLabel,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

const FINISHING: DialogState = { status: 'finishing' }

describe('the singer states of the transcribe dialog', () => {
  it('shows "Loading singer model" with the elapsed time at the step singers-download', () => {
    const state = transcribeDialogReducer(FINISHING, {
      type: 'stage',
      stage: 'singers-download',
    }) as RunState

    expect(state).toEqual({ status: 'singers-loading' })
    expect(progressText(state, 3000, '')).toBe('Loading singer model, 0:03 elapsed')
    expect(progressValue(state)).toBeUndefined()
  })

  it('shows "Downloading singer model, N%" with the progress bar', () => {
    const state = transcribeDialogReducer(FINISHING, {
      type: 'singers-download',
      percent: 40,
    }) as RunState

    expect(progressText(state, 3000, '')).toBe('Downloading singer model, 40%')
    expect(progressValue(state)).toBe(0.4)
  })

  it('shows "Finding the singers" with the elapsed time before the first progress', () => {
    const state = transcribeDialogReducer(FINISHING, {
      type: 'stage',
      stage: 'finding-singers',
    }) as RunState

    expect(progressText(state, 12_000, '')).toBe('Finding the singers, 0:12 elapsed')
    expect(stateLabel(state, '')).toBe('Finding the singers')
  })

  it('shows "Finding the singers, m:ss of m:ss" with the progress bar', () => {
    const state = transcribeDialogReducer(FINISHING, {
      type: 'singers-progress',
      doneMs: 72_000,
      totalMs: 220_000,
    }) as RunState

    expect(progressText(state, 0, '')).toBe('Finding the singers, 1:12 of 3:40')
    expect(progressValue(state)).toBeCloseTo(72 / 220)
  })

  it('ignores a singer event after the run stopped', () => {
    const idle: DialogState = { status: 'idle' }

    expect(transcribeDialogReducer(idle, { type: 'singers-download', percent: 1 })).toBe(idle)
  })
})

describe('outcomeText with the singer step', () => {
  const counts = { wordCount: 214, estimatedCount: 9, runData: 'stored' as const }

  it('names the voice count when the step made voices', () => {
    const singers: SingerOutcome = { status: 'split', voiceCount: 2, voiceName: 'Lead' }

    expect(outcomeText({ ...counts, singers })).toBe('214 words on 2 voices, 9 estimated')
  })

  it.each<[string, SingerOutcome, string]>([
    [
      'one singer',
      { status: 'split', voiceCount: 1, voiceName: 'Lead' },
      'The app found one singer. All phrases stay on Lead. If the song has more singers, select the count in "Singers" and run again.',
    ],
    [
      'a cancel',
      { status: 'cancelled', voiceName: 'Lead' },
      'The app stopped the search for the singers. All phrases stay on Lead.',
    ],
    [
      'no separated vocals',
      { status: 'no-vocals', voiceName: 'Lead' },
      'The app finds the singers only in separated vocals. All phrases stay on Lead.',
    ],
    [
      'a model failure',
      { status: 'failed', kind: 'model', voiceName: 'Lead' },
      'The app could not find the singers. All phrases stay on Lead.',
    ],
    [
      'an unknown failure',
      { status: 'failed', kind: 'unknown', voiceName: 'Lead' },
      'The app could not find the singers. All phrases stay on Lead.',
    ],
    [
      'a download failure',
      { status: 'failed', kind: 'download', voiceName: 'Lead' },
      'The app could not download the singer model. Check the connection. All phrases stay on Lead.',
    ],
    [
      'a memory failure',
      { status: 'failed', kind: 'memory', voiceName: 'Lead' },
      'This browser does not have enough memory to find the singers of this song. All phrases stay on Lead.',
    ],
  ])('adds the message after %s', (_name, singers, message) => {
    expect(singerMessage(singers)).toBe(message)
    expect(outcomeText({ ...counts, singers })).toBe(`214 words, 9 estimated. ${message}`)
  })

  it('states that the song has no free voice when the step found more singers at 12 voices', () => {
    const singers: SingerOutcome = { status: 'capped', voiceCount: 1, voiceName: 'Lead' }
    const message =
      'The song has 12 voices, so the app cannot add a voice for each singer. All phrases stay on Lead.'

    expect(singerMessage(singers)).toBe(message)
    expect(outcomeText({ ...counts, singers })).toBe(`214 words, 9 estimated. ${message}`)
  })

  it('states the free voices when the step found more singers than free voices', () => {
    const singers: SingerOutcome = { status: 'capped', voiceCount: 3, voiceName: 'Lead' }
    const message = 'The song has room for 2 more voices. The other singers stay on Lead.'

    expect(singerMessage(singers)).toBe(message)
    expect(outcomeText({ ...counts, singers })).toBe(
      `214 words on 3 voices, 9 estimated. ${message}`,
    )
  })

  it('keeps the text of a run without the option', () => {
    expect(outcomeText({ wordCount: 1, estimatedCount: 0, runData: 'stored' })).toBe(
      '1 word, 0 estimated',
    )
  })
})
