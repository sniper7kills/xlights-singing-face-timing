import { describe, expect, it } from 'vitest'
import { guess } from './guess.ts'
import { toPhonemeLabels } from './toPhonemeLabels.ts'

function guessLabels(word: string) {
  return toPhonemeLabels(guess(word))
}

describe('guess', () => {
  it('gives the word ZXQV phonemes', () => {
    expect(guessLabels('ZXQV')).toEqual(['etc', 'WQ', 'FV'])
  })

  it('maps A and I to AI, E to E, O to O and U to U', () => {
    expect(guessLabels('BA')).toEqual(['MBP', 'AI'])
    expect(guessLabels('BI')).toEqual(['MBP', 'AI'])
    expect(guessLabels('BE')).toEqual(['MBP', 'E'])
    expect(guessLabels('BO')).toEqual(['MBP', 'O'])
    expect(guessLabels('BU')).toEqual(['MBP', 'U'])
  })

  it('maps each consonant family of the mapping table', () => {
    expect(guessLabels('M')).toEqual(['MBP'])
    expect(guessLabels('P')).toEqual(['MBP'])
    expect(guessLabels('F')).toEqual(['FV'])
    expect(guessLabels('L')).toEqual(['L'])
    expect(guessLabels('W')).toEqual(['WQ'])
    expect(guessLabels('Q')).toEqual(['WQ'])
    expect(guessLabels('CDGHJKNRSTXYZ')).toEqual(['etc'])
  })

  it('gives one vowel for a group of adjacent vowel letters, from its first letter', () => {
    expect(guess('ROOF')).toEqual(['R', 'OW', 'F'])
    expect(guessLabels('BEAT')).toEqual(['MBP', 'E', 'etc'])
  })

  it('gives one symbol for each letter of a consonant group', () => {
    expect(guess('ST')).toEqual(['S', 'T'])
  })

  it('ignores digits and apostrophes', () => {
    expect(guess("4T'O")).toEqual(['T', 'OW'])
  })

  it('gives one etc phoneme to a word of digits only', () => {
    expect(guessLabels('12')).toEqual(['etc'])
  })

  it('gives one etc phoneme to an empty key', () => {
    expect(guessLabels('')).toEqual(['etc'])
  })
})
