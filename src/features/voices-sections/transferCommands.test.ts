import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { layerFocusId, resetMarkUi, useMarkUiStore } from '../timeline-editor/markUiStore.ts'
import { endTransfer, startTransfer, useTransferStore } from './transferCommands.ts'

function voiceOf(id: string) {
  return useSongStore.getState().current?.marks.find((mark) => mark.id === id)?.voiceId
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
  useViewStore.getState().resetView()
  useTransferStore.setState({ pending: null })
  resetMarkUi()
})

describe('startTransfer', () => {
  it('keeps a transfer to a voice with phrases in the range pending, with the count', () => {
    startTransfer(['p1'], OTHER_VOICE, 'move')

    expect(useTransferStore.getState().pending).toEqual({
      phraseIds: ['p1'],
      toVoiceId: OTHER_VOICE,
      mode: 'move',
      count: 1,
    })
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('moves the phrases to a new voice and clears the selection', () => {
    useViewStore.getState().selectMarks(['p1'])

    startTransfer(['p1'], 'new', 'move')

    expect(voiceOf('p1')).toBe(useSongStore.getState().current?.voices[2]?.id)
    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })

  it('requests the focus for the phrase track of the shown voice after a move', () => {
    useViewStore.getState().selectMarks(['p2'])

    startTransfer(['p2'], OTHER_VOICE, 'move')

    expect(useMarkUiStore.getState().focusId).toBe(layerFocusId(VOICE, 'phrase'))
  })

  it('leaves the focus after a copy', () => {
    startTransfer(['p2'], OTHER_VOICE, 'copy')

    expect(useMarkUiStore.getState().focusId).toBeNull()
  })

  it('keeps the selection when no new voice comes', () => {
    useViewStore.getState().selectMarks(['w1'])

    startTransfer(['w1'], 'new', 'move')

    expect(useSongStore.getState().current?.voices).toHaveLength(2)
    expect(useViewStore.getState().selectedMarkIds).toEqual(['w1'])
  })
})

describe('endTransfer', () => {
  it('replaces the target phrases for true and clears the pending transfer', () => {
    startTransfer(['p1'], OTHER_VOICE, 'copy')

    endTransfer(true)

    expect(voiceOf('q1')).toBeUndefined()
    expect(voiceOf('p1')).not.toBe(OTHER_VOICE)
    expect(useTransferStore.getState().pending).toBeNull()
  })

  it('changes nothing with no pending transfer', () => {
    endTransfer(true)

    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})
