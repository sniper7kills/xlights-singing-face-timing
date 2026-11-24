import { describe, expect, it } from 'vitest'
import { PHONEME_LABELS } from '../dictionary/cmuSymbols.ts'
import { counterIds } from './editRules.test-helpers.ts'
import { FRAME_MS, mark } from './fixtures.test-helpers.ts'
import { divideLabel, guessPhonemes } from './words.ts'

describe('divideLabel', () => {
  it('divides the label at the character position nearest to the fraction', () => {
    expect(divideLabel('silent', 0.3)).toEqual(['si', 'lent'])
  })

  it('keeps one character or more in each part', () => {
    expect(divideLabel('night', 0)).toEqual(['n', 'ight'])
    expect(divideLabel('night', 1)).toEqual(['nigh', 't'])
  })

  it('gives the same label to both parts for a label of one character', () => {
    expect(divideLabel(' a ', 0.5)).toEqual(['a', 'a'])
  })

  it('removes the spaces at the ends of each part', () => {
    expect(divideLabel('all is calm', 0.5)).toEqual(['all is', 'calm'])
  })

  it('keeps a character outside the basic plane whole', () => {
    expect(divideLabel('a😀b', 0.5)).toEqual(['a😀', 'b'])
  })
})

describe('guessPhonemes', () => {
  it('gives phonemes from the guess that fill the word with no gap', () => {
    const word = mark('w', { label: 'night', startMs: 1000, endMs: 1500 })

    const phonemes = guessPhonemes(word, FRAME_MS, counterIds())

    expect(phonemes[0]?.startMs).toBe(1000)
    expect(phonemes.at(-1)?.endMs).toBe(1500)
    for (const phoneme of phonemes) {
      expect(phoneme).toMatchObject({ layer: 'phoneme', parentId: 'w', edited: false })
      expect(PHONEME_LABELS).toContain(phoneme.label)
    }
  })

  it('gives one phoneme or more for a label with no letter', () => {
    const word = mark('w', { label: '...', startMs: 0, endMs: 50 })

    expect(guessPhonemes(word, FRAME_MS, counterIds())).toHaveLength(1)
  })
})
