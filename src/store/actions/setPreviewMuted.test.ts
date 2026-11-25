import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { openTestSong, steps } from './actions.test-helpers.ts'
import { setVoicePreviewMuted } from './setPreviewMuted.ts'

function muted(id: string): boolean | undefined {
  return useSongStore.getState().current?.voices.find((voice) => voice.id === id)?.previewMuted
}

beforeEach(() => openTestSong())

describe('setVoicePreviewMuted', () => {
  it('mutes a voice as one undo step and leaves the other voice', () => {
    setVoicePreviewMuted(VOICE, true)

    expect(muted(VOICE)).toBe(true)
    expect(muted(OTHER_VOICE)).toBeUndefined()
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(muted(VOICE)).toBeUndefined()
  })

  it('unmutes a muted voice as one more undo step', () => {
    setVoicePreviewMuted(VOICE, true)
    setVoicePreviewMuted(VOICE, false)

    expect(muted(VOICE)).toBe(false)
    expect(steps()).toBe(2)
  })

  it('records no step for the same value or an unknown id', () => {
    setVoicePreviewMuted(VOICE, false)
    setVoicePreviewMuted('no-such-voice', true)
    setVoicePreviewMuted(OTHER_VOICE, true)
    setVoicePreviewMuted(OTHER_VOICE, true)

    expect(steps()).toBe(1)
  })
})
