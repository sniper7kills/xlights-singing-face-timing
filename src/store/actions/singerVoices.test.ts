import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { MAX_VOICES, VOICE_COLORS } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { find, marksOf, openTestSong, steps } from './actions.test-helpers.ts'
import { violations } from './invariant.test-helpers.ts'
import { putSingersOnVoices } from './singerVoices.ts'
import { addVoice } from './voices.ts'

function current(): SongContent {
  const content = useSongStore.getState().current
  if (content === null) throw new Error('No song is open.')
  return content
}

function voiceNamed(name: string) {
  const voice = current().voices.find((item) => item.name === name)
  if (voice === undefined) throw new Error(`No voice has the name ${name}.`)
  return voice
}

function marksOn(voiceId: string, layer?: Mark['layer']): Mark[] {
  return marksOf().filter(
    (mark) => mark.voiceId === voiceId && (layer === undefined || mark.layer === layer),
  )
}

beforeEach(() => openTestSong())

describe('putSingersOnVoices', () => {
  it('adds "Singer 2" with the next colour and moves the phrases of singer 1 to it, as one undo step', () => {
    const count = putSingersOnVoices(
      VOICE,
      new Map([
        ['p1', [0]],
        ['p2', [1]],
      ]),
    )

    const singer = voiceNamed('Singer 2')
    expect(count).toBe(2)
    expect(singer).toMatchObject({ order: 2, color: VOICE_COLORS[0] })
    expect(find('p2')?.voiceId).toBe(singer.id)
    expect(find('w4')).toMatchObject({ voiceId: singer.id, parentId: 'p2' })
    expect(find('w4a')).toMatchObject({ voiceId: singer.id, parentId: 'w4' })
    expect(find('p1')?.voiceId).toBe(VOICE)
    expect(steps()).toBe(1)
    expect(violations(current())).toEqual([])
  })

  it('copies a phrase of two singers to the second voice with new ids and keeps it on the first', () => {
    putSingersOnVoices(VOICE, new Map([['p2', [0, 1]]]))

    const singer = voiceNamed('Singer 2')
    const copies = marksOn(singer.id)
    expect(find('p2')?.voiceId).toBe(VOICE)
    expect(copies).toHaveLength(5)
    expect(copies.map((mark) => mark.id)).not.toContain('p2')
    const phrase = copies.find((mark) => mark.layer === 'phrase')
    const word = copies.find((mark) => mark.layer === 'word')
    expect(word?.parentId).toBe(phrase?.id)
    expect(copies.filter((mark) => mark.parentId === word?.id)).toHaveLength(3)
    expect(violations(current())).toEqual([])
  })

  it('moves a phrase to its first singer and copies it to the next one', () => {
    putSingersOnVoices(
      VOICE,
      new Map([
        ['p1', [0]],
        ['p2', [1, 2]],
      ]),
    )

    const second = voiceNamed('Singer 2')
    const third = voiceNamed('Singer 3')
    expect(find('p2')?.voiceId).toBe(second.id)
    expect(marksOn(third.id, 'phrase').map((mark) => mark.label)).toEqual(['night'])
    expect(third.color).toBe(VOICE_COLORS[1])
    expect(violations(current())).toEqual([])
  })

  it('changes only the phrases that the run wrote', () => {
    putSingersOnVoices(VOICE, new Map([['p2', [1]]]))

    expect(find('p1')?.voiceId).toBe(VOICE)
    expect(find('p3')?.voiceId).toBe(VOICE)
    expect(find('q1')?.voiceId).toBe(OTHER_VOICE)
  })

  it('takes the lowest free number for the name of a new voice', () => {
    addVoice('song-1', 'Singer 2')

    putSingersOnVoices(VOICE, new Map([['p2', [1]]]))

    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 3').id)
  })

  it('restores the song exactly with one undo', () => {
    putSingersOnVoices(
      VOICE,
      new Map([
        ['p1', [0, 1]],
        ['p2', [1]],
        ['p3', [2]],
      ]),
    )

    useSongStore.getState().undo()

    expect(current()).toEqual(testContent())
  })

  it('makes no empty voice for a gap in the singer numbers, as one undo step', () => {
    const count = putSingersOnVoices(
      VOICE,
      new Map([
        ['p1', [0]],
        ['p2', [5]],
      ]),
    )

    expect(count).toBe(2)
    expect(current().voices).toHaveLength(testContent().voices.length + 1)
    for (const voice of current().voices) expect(marksOn(voice.id, 'phrase')).not.toHaveLength(0)
    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 2').id)
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(current()).toEqual(testContent())
  })

  it('records no step for one singer, an unknown voice or no phrase of the run', () => {
    putSingersOnVoices(VOICE, new Map([['p1', [0]]]))
    putSingersOnVoices('gone', new Map([['p1', [1]]]))
    expect(putSingersOnVoices(VOICE, new Map([['q1', [1]]]))).toBe(1)

    expect(steps()).toBe(0)
  })

  it('keeps a singer with no free voice on the voice of the run at 12 voices', () => {
    while (current().voices.length < MAX_VOICES - 1) addVoice('song-1')
    const before = steps()

    const count = putSingersOnVoices(
      VOICE,
      new Map([
        ['p1', [1]],
        ['p2', [2]],
      ]),
    )

    expect(count).toBe(2)
    expect(current().voices).toHaveLength(MAX_VOICES)
    expect(find('p1')?.voiceId).toBe(voiceNamed('Singer 2').id)
    expect(find('p2')?.voiceId).toBe(VOICE)
    expect(steps()).toBe(before + 1)
  })
})
