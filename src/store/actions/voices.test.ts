import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { SongContent, Voice } from '../types.ts'
import { marksOf, openTestSong, steps } from './actions.test-helpers.ts'
import {
  addVoice,
  addVoiceStep,
  deleteVoice,
  renameVoice,
  reorderVoices,
  setVoiceColor,
} from './voices.ts'

const SONG = 'song-1'

function voices(): Voice[] {
  return useSongStore.getState().current?.voices ?? []
}

function current(): SongContent | null {
  return useSongStore.getState().current
}

/** Fills the open song to 12 voices, as one undo step for each new voice. */
function fillToMax() {
  while (voices().length < MAX_VOICES) addVoice(SONG)
}

beforeEach(() => openTestSong())

describe('addVoiceStep', () => {
  it('gives the content with a new voice at the end and does not change its input', () => {
    const content = testContent()
    const result = addVoiceStep(content, '  Santa ')

    expect(result?.voice).toMatchObject({ songId: SONG, name: 'Santa', order: 2, color: '#ffb238' })
    expect(result?.content.voices.at(-1)).toBe(result?.voice)
    expect(content.voices).toHaveLength(2)
  })

  it('gives null for a name with a field error', () => {
    expect(addVoiceStep(testContent(), 'lead')).toBeNull()
  })
})

describe('addVoice', () => {
  it('adds "Voice 2" with the next colour as one undo step', () => {
    const added = addVoice(SONG)

    expect(added).toMatchObject({ name: 'Voice 2', order: 2, color: '#ffb238' })
    expect(voices().map((voice) => voice.name)).toEqual(['Lead', 'Backing', 'Voice 2'])
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(voices()).toHaveLength(2)
  })

  it('returns null and records no step at 12 voices or for another song', () => {
    fillToMax()
    const before = steps()

    expect(addVoice(SONG)).toBeNull()
    expect(addVoice('other-song')).toBeNull()
    expect(voices()).toHaveLength(MAX_VOICES)
    expect(steps()).toBe(before)
  })
})

describe('renameVoice', () => {
  it('stores the trimmed name as one undo step', () => {
    renameVoice(OTHER_VOICE, '  Santa  ')

    expect(voices()[1]?.name).toBe('Santa')
    expect(steps()).toBe(1)
  })

  it('records no step for a duplicate name, an empty name, the same name or an unknown id', () => {
    renameVoice(OTHER_VOICE, 'LEAD')
    renameVoice(OTHER_VOICE, ' ')
    renameVoice(OTHER_VOICE, 'Backing')
    renameVoice('gone', 'Elf')

    expect(voices()[1]?.name).toBe('Backing')
    expect(steps()).toBe(0)
  })
})

describe('setVoiceColor', () => {
  it('sets a preset colour as one undo step', () => {
    setVoiceColor(VOICE, '#4cc9f0')

    expect(voices()[0]?.color).toBe('#4cc9f0')
    expect(steps()).toBe(1)
  })

  it('records no step for an unknown id', () => {
    setVoiceColor('gone', '#4cc9f0')

    expect(current()).toEqual(testContent())
    expect(steps()).toBe(0)
  })

  it('records no step for a colour outside the presets or the same colour', () => {
    setVoiceColor(VOICE, '#123456')
    setVoiceColor(VOICE, '#4cc9f0')
    setVoiceColor(VOICE, '#4cc9f0')

    expect(steps()).toBe(1)
  })
})

describe('reorderVoices', () => {
  it('sorts the voices and sets order 0, 1 as one undo step', () => {
    reorderVoices(SONG, [OTHER_VOICE, VOICE])

    expect(voices().map((voice) => [voice.id, voice.order])).toEqual([
      [OTHER_VOICE, 0],
      [VOICE, 1],
    ])
    expect(steps()).toBe(1)
  })

  it('records no step for an unknown id, the same order or another song', () => {
    reorderVoices(SONG, [OTHER_VOICE, 'gone'])
    reorderVoices(SONG, [VOICE, OTHER_VOICE])
    reorderVoices('other-song', [OTHER_VOICE, VOICE])

    expect(current()).toEqual(testContent())
    expect(steps()).toBe(0)
  })
})

describe('deleteVoice', () => {
  it('removes the voice with its marks, and one undo restores both', () => {
    deleteVoice(VOICE)

    expect(voices()).toEqual([{ ...testContent().voices[1], order: 0 }])
    expect(marksOf().map((mark) => mark.id)).toEqual(['q1'])
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(current()).toEqual(testContent())
  })

  it('records no step for the last voice or an unknown id', () => {
    deleteVoice('gone')
    deleteVoice(VOICE)
    deleteVoice(OTHER_VOICE)

    expect(voices()).toHaveLength(1)
    expect(steps()).toBe(1)
  })
})
