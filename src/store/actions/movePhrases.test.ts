import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { SongContent } from '../types.ts'
import { find, marksOf, openTestSong, steps } from './actions.test-helpers.ts'
import { movePhrases, movePhrasesToNewVoice, phrasesInTargetRange } from './movePhrases.ts'
import { addVoice } from './voices.ts'

function current(): SongContent | null {
  return useSongStore.getState().current
}

function idsOf(voiceId: string): string[] {
  return marksOf()
    .filter((mark) => mark.voiceId === voiceId)
    .map((mark) => mark.id)
}

beforeEach(() => openTestSong())

describe('movePhrases', () => {
  it('moves a phrase to another voice as one undo step', () => {
    movePhrases(['p2'], OTHER_VOICE, 'move', false)

    expect(find('w4')).toMatchObject({ voiceId: OTHER_VOICE, startMs: 3200, parentId: 'p2' })
    expect(idsOf(VOICE)).not.toContain('p2')
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(current()).toEqual(testContent())
  })

  it('copies a phrase as one undo step, and an edit of the copy leaves the source', () => {
    movePhrases(['p2'], OTHER_VOICE, 'copy', false)

    expect(steps()).toBe(1)
    const copy = marksOf().find((mark) => mark.voiceId === OTHER_VOICE && mark.label === 'night')
    expect(copy).toBeDefined()
    expect(copy?.id).not.toBe('w4')
    useSongStore.getState().apply((content) => ({
      ...content,
      marks: content.marks.map((mark) => (mark === copy ? { ...mark, label: 'day' } : mark)),
    }))
    expect(find('w4')?.label).toBe('night')
  })

  it('records no step for a conflict without replace, and replaces the conflict with replace', () => {
    movePhrases(['p1'], OTHER_VOICE, 'move', false)
    expect(steps()).toBe(0)

    movePhrases(['p1'], OTHER_VOICE, 'move', true)
    expect(find('q1')).toBeUndefined()
    expect(find('p1')?.voiceId).toBe(OTHER_VOICE)
    expect(steps()).toBe(1)
  })

  it('records no step for an unknown voice', () => {
    movePhrases(['p2'], 'gone', 'move', false)

    expect(steps()).toBe(0)
  })

  it('keeps the voice with no marks after a move of every phrase', () => {
    movePhrases(['p1', 'p2', 'p3'], OTHER_VOICE, 'move', true)

    expect(idsOf(VOICE)).toEqual([])
    expect(current()?.voices.map((voice) => voice.id)).toContain(VOICE)
  })
})

describe('movePhrasesToNewVoice', () => {
  it('adds a voice with the phrases as one undo step, and one undo removes both', () => {
    const voice = movePhrasesToNewVoice(['p1'], 'move')

    expect(voice).toMatchObject({ name: 'Voice 2', order: 2 })
    expect(find('p1')?.voiceId).toBe(voice?.id)
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(current()).toEqual(testContent())
  })

  it('returns null and records no step at 12 voices or with no phrase', () => {
    while ((current()?.voices.length ?? 0) < MAX_VOICES) addVoice('song-1')
    const before = steps()

    expect(movePhrasesToNewVoice(['p1'], 'copy')).toBeNull()
    expect(steps()).toBe(before)
    useSongStore.getState().undo()
    expect(movePhrasesToNewVoice(['w1'], 'copy')).toBeNull()
    expect(steps()).toBe(before - 1)
  })
})

describe('phrasesInTargetRange', () => {
  it('counts the target phrases that a replace removes', () => {
    expect(phrasesInTargetRange(['p1'], OTHER_VOICE)).toBe(1)
    expect(phrasesInTargetRange(['p2'], OTHER_VOICE)).toBe(0)
  })

  it('gives 0 with no open song', () => {
    useSongStore.setState({ current: null })

    expect(phrasesInTargetRange(['p1'], OTHER_VOICE)).toBe(0)
  })
})
