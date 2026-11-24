import { describe, expect, it } from 'vitest'
import cmudictText from '../../../vendor/cmudict/cmudict.dict?raw'
import { CMU_SYMBOLS, findCmuSymbol, PHONEME_LABELS } from './cmuSymbols.ts'

describe('PHONEME_LABELS', () => {
  it('holds the ten phoneme labels of the xLights Faces effect', () => {
    expect([...PHONEME_LABELS].sort()).toEqual(
      ['AI', 'E', 'FV', 'L', 'MBP', 'O', 'U', 'WQ', 'etc', 'rest'].sort(),
    )
  })
})

describe('CMU_SYMBOLS', () => {
  it('holds 39 symbols, each one time', () => {
    expect(new Set(CMU_SYMBOLS.map((entry) => entry.symbol)).size).toBe(39)
    expect(CMU_SYMBOLS).toHaveLength(39)
  })

  it('maps each symbol to the label of the mapping table in the feature file', () => {
    const byLabel: Record<string, string[]> = {}
    for (const { symbol, label } of CMU_SYMBOLS) (byLabel[label] ??= []).push(symbol)

    expect(byLabel).toEqual({
      AI: ['AA', 'AE', 'AH', 'AY', 'IH'],
      E: ['EH', 'ER', 'EY', 'IY'],
      O: ['AO', 'AW', 'OW'],
      U: ['UH', 'UW'],
      WQ: ['OY', 'W'],
      L: ['L'],
      MBP: ['B', 'M', 'P'],
      FV: ['F', 'V'],
      etc: [
        'CH',
        'D',
        'DH',
        'G',
        'HH',
        'JH',
        'K',
        'N',
        'NG',
        'R',
        'S',
        'SH',
        'T',
        'TH',
        'Y',
        'Z',
        'ZH',
      ],
    })
  })

  it('knows every symbol that cmudict.dict uses', () => {
    const used = new Set(
      cmudictText
        .split('\n')
        .flatMap((line) => line.replace(/#.*/, '').trim().split(' ').slice(1))
        .filter((symbol) => symbol !== ''),
    )

    expect([...used].filter((symbol) => findCmuSymbol(symbol) === undefined)).toEqual([])
  })
})

describe('findCmuSymbol', () => {
  it('finds a vowel with each stress digit and without a digit', () => {
    for (const text of ['AY', 'AY0', 'AY1', 'AY2']) expect(findCmuSymbol(text)?.label).toBe('AI')
  })

  it('finds a consonant without a digit', () => {
    expect(findCmuSymbol('HH')).toEqual({ symbol: 'HH', label: 'etc', vowel: false })
  })

  it('rejects a consonant with a stress digit', () => {
    expect(findCmuSymbol('L1')).toBeUndefined()
  })

  it('rejects a vowel with the stress digit 3', () => {
    expect(findCmuSymbol('AY3')).toBeUndefined()
  })

  it('rejects a symbol in lower case', () => {
    expect(findCmuSymbol('hh')).toBeUndefined()
  })

  it('rejects the xLights-only symbol E21', () => {
    expect(findCmuSymbol('E21')).toBeUndefined()
  })

  it('rejects XX', () => {
    expect(findCmuSymbol('XX')).toBeUndefined()
  })
})
