import { describe, expect, it } from 'vitest'
import type { Mark, Voice } from '../../store/types.ts'
import {
  DUPLICATE_NAME_ERROR,
  idsAfterMove,
  NAME_CHARACTER_ERROR,
  NAME_LENGTH_ERROR,
  nextVoiceColor,
  nextVoiceName,
  numbered,
  phraseCounts,
  reorderedVoices,
  VOICE_COLOR_NAMES,
  VOICE_COLORS,
  voiceNameError,
} from './voiceRules.ts'

function voice(id: string, name: string, order: number, color = '#ffb238'): Voice {
  return { id, songId: 'song-1', name, order, color }
}

const LEAD = voice('a', 'Lead Vocals', 0)

describe('VOICE_COLORS', () => {
  it('has 8 colours with a name each, and Amber first', () => {
    expect(VOICE_COLORS).toHaveLength(8)
    expect(VOICE_COLORS[0]).toBe('#ffb238')
    expect(VOICE_COLORS.map((color) => VOICE_COLOR_NAMES[color])).toEqual([
      'Amber',
      'Sky',
      'Green',
      'Pink',
      'Violet',
      'Red',
      'Teal',
      'Lime',
    ])
  })
})

describe('nextVoiceName', () => {
  it('gives "Voice 2" for a song with one voice', () => {
    expect(nextVoiceName([LEAD])).toBe('Voice 2')
  })

  it('gives the lowest free number when the numbers have a gap', () => {
    expect(nextVoiceName([LEAD, voice('b', 'Voice 2', 1), voice('c', 'voice 4', 2)])).toBe(
      'Voice 3',
    )
  })
})

describe('nextVoiceColor', () => {
  it('gives the first colour that no voice has', () => {
    expect(nextVoiceColor([LEAD, voice('b', 'B', 1, '#7ae582')])).toBe('#4cc9f0')
  })

  it('gives the colour at the voice count modulo 8 when each colour is in use', () => {
    const voices = VOICE_COLORS.map((color, index) => voice(`v${index}`, `V${index}`, index, color))
    expect(nextVoiceColor(voices)).toBe(VOICE_COLORS[0])
    expect(nextVoiceColor([...voices, voice('x', 'X', 8, '#ffb238')])).toBe(VOICE_COLORS[1])
  })
})

describe('voiceNameError', () => {
  const voices = [LEAD, voice('b', 'Santa', 1)]

  it('accepts a legal name, and the own name of the voice', () => {
    expect(voiceNameError(voices, null, 'Elf')).toBeNull()
    expect(voiceNameError(voices, 'b', 'santa')).toBeNull()
  })

  it('rejects an empty name and a name longer than 60 characters', () => {
    expect(voiceNameError(voices, null, '   ')).toBe(NAME_LENGTH_ERROR)
    expect(voiceNameError(voices, null, 'x'.repeat(61))).toBe(NAME_LENGTH_ERROR)
    expect(voiceNameError(voices, null, ` ${'x'.repeat(60)} `)).toBeNull()
  })

  it('rejects each forbidden character', () => {
    for (const character of ['<', '>', '&', '"'])
      expect(voiceNameError(voices, null, `A${character}B`)).toBe(NAME_CHARACTER_ERROR)
  })

  it('rejects a duplicate name without regard to letter case or spaces', () => {
    expect(voiceNameError(voices, null, ' SANTA ')).toBe(DUPLICATE_NAME_ERROR)
    expect(voiceNameError(voices, 'a', 'santa')).toBe(DUPLICATE_NAME_ERROR)
  })
})

describe('reorderedVoices', () => {
  const voices = [LEAD, voice('b', 'B', 1), voice('c', 'C', 2)]

  it('gives the voices in the new order with order 0, 1, 2', () => {
    expect(reorderedVoices(voices, ['c', 'a', 'b'])).toEqual([
      { ...voices[2], order: 0 },
      { ...LEAD, order: 1 },
      { ...voices[1], order: 2 },
    ])
  })

  it('gives null for an unknown, a repeated or a missing id', () => {
    expect(reorderedVoices(voices, ['a', 'b', 'x'])).toBeNull()
    expect(reorderedVoices(voices, ['a', 'b', 'b'])).toBeNull()
    expect(reorderedVoices(voices, ['a', 'b'])).toBeNull()
  })
})

describe('idsAfterMove', () => {
  const voices = [LEAD, voice('b', 'B', 1), voice('c', 'C', 2)]

  it('moves a voice one place up or down', () => {
    expect(idsAfterMove(voices, 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(idsAfterMove(voices, 'b', 1)).toEqual(['a', 'c', 'b'])
  })

  it('keeps the order for the first voice up, the last voice down and an unknown id', () => {
    expect(idsAfterMove(voices, 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(idsAfterMove(voices, 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(idsAfterMove(voices, 'x', 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('numbered', () => {
  it('closes a gap in the order and keeps the object of a voice with its index', () => {
    const result = numbered([LEAD, voice('c', 'C', 2)])
    expect(result.map((item) => item.order)).toEqual([0, 1])
    expect(result[0]).toBe(LEAD)
  })
})

describe('phraseCounts', () => {
  it('counts the phrases of each voice and ignores words and phonemes', () => {
    const mark = (voiceId: string, layer: Mark['layer']): Mark => ({
      id: `${voiceId}-${layer}`,
      voiceId,
      layer,
      label: 'x',
      startMs: 0,
      endMs: 50,
      parentId: null,
      edited: false,
    })
    const counts = phraseCounts([
      mark('a', 'phrase'),
      mark('a', 'phrase'),
      mark('a', 'word'),
      mark('b', 'phoneme'),
    ])
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBeUndefined()
  })
})
