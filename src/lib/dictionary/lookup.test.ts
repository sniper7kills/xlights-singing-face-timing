import { describe, expect, it } from 'vitest'
import { lookup } from './lookup.ts'
import { spread } from './spread.ts'
import { toPhonemeLabels } from './toPhonemeLabels.ts'
import type { Dictionary } from './types.ts'

const dictionary: Dictionary = {
  HELLO: 'HH AH0 L OW1',
  "SINGIN'": 'S IH1 NG IH0 N',
  SINGING: 'S IH1 NG IH0 NG',
  RUNNING: 'R AH1 N IH0 NG',
}

describe('lookup', () => {
  it('finds a word in the dictionary', () => {
    expect(lookup('hello', {}, dictionary)).toEqual({
      symbols: ['HH', 'AH0', 'L', 'OW1'],
      source: 'cmu',
    })
  })

  it('returns custom for hello when the custom dictionary has HELLO', () => {
    expect(lookup('hello', { HELLO: 'HH EH1 L OW0' }, dictionary)).toEqual({
      symbols: ['HH', 'EH1', 'L', 'OW0'],
      source: 'custom',
    })
  })

  it('normalises the label before the lookup', () => {
    expect(lookup('"Hello!"', {}, dictionary).source).toBe('cmu')
  })

  it("looks up SINGIN' before SINGING", () => {
    expect(lookup("singin'", {}, dictionary).symbols).toEqual(['S', 'IH1', 'NG', 'IH0', 'N'])
  })

  it("looks up RUNNING when the dictionary has no RUNNIN'", () => {
    expect(lookup("runnin'", {}, dictionary)).toEqual({
      symbols: ['R', 'AH1', 'N', 'IH0', 'NG'],
      source: 'cmu',
    })
  })

  it("gives a custom SINGING priority over a SINGIN' in the dictionary", () => {
    expect(lookup("singin'", { SINGING: 'S IH1 NG' }, dictionary)).toEqual({
      symbols: ['S', 'IH1', 'NG'],
      source: 'custom',
    })
  })

  it('guesses the word Zxqv and marks it unknown', () => {
    const result = lookup('Zxqv', {}, dictionary)

    expect(result.source).toBe('guess')
    expect(toPhonemeLabels(result.symbols).length).toBeGreaterThan(0)
  })

  it('treats a word of digits only as unknown, even when a table has the key', () => {
    expect(lookup('12', { '12': 'T W EH1 L V' }, dictionary)).toEqual({
      symbols: ['HH'],
      source: 'guess',
    })
  })

  it('gives a label with only punctuation one etc phoneme and marks it unknown', () => {
    const result = lookup('-', {}, dictionary)

    expect(result.source).toBe('guess')
    expect(spread(toPhonemeLabels(result.symbols), 0, 500, 50)).toEqual([
      { label: 'etc', startMs: 0, endMs: 500 },
    ])
  })

  it('ignores a key that only Object.prototype has', () => {
    expect(lookup('constructor', {}, dictionary).source).toBe('guess')
  })
})
