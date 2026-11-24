import { describe, expect, it } from 'vitest'
import { mergeEqualNeighbours, toPhonemeLabels } from './toPhonemeLabels.ts'

describe('toPhonemeLabels', () => {
  it("maps HH AH0 L OW1 to ['etc','AI','L','O']", () => {
    expect(toPhonemeLabels(['HH', 'AH0', 'L', 'OW1'])).toEqual(['etc', 'AI', 'L', 'O'])
  })

  it("merges the adjacent etc labels of S T AA1 R to ['etc','AI','etc']", () => {
    expect(toPhonemeLabels(['S', 'T', 'AA1', 'R'])).toEqual(['etc', 'AI', 'etc'])
  })

  it('ignores the stress digit of a vowel', () => {
    expect(toPhonemeLabels(['IY0'])).toEqual(toPhonemeLabels(['IY2']))
  })

  it('maps OY to WQ although OY is a vowel', () => {
    expect(toPhonemeLabels(['B', 'OY1'])).toEqual(['MBP', 'WQ'])
  })

  it('returns no labels for no symbols', () => {
    expect(toPhonemeLabels([])).toEqual([])
  })

  it('throws an error that names an item that is not a CMU symbol', () => {
    expect(() => toPhonemeLabels(['HH', 'XX'])).toThrow('XX is not a CMU symbol.')
  })
})

describe('mergeEqualNeighbours', () => {
  it('keeps equal labels that are not adjacent', () => {
    expect(mergeEqualNeighbours(['AI', 'etc', 'AI'])).toEqual(['AI', 'etc', 'AI'])
  })

  it('merges a run of three equal labels into one label', () => {
    expect(mergeEqualNeighbours(['MBP', 'MBP', 'MBP', 'O'])).toEqual(['MBP', 'O'])
  })
})
