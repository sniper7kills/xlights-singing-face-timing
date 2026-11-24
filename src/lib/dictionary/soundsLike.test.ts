import { describe, expect, it } from 'vitest'
import { resolveSoundsLike } from './soundsLike.ts'

const DICTIONARY = { ROO: 'R UW1', DOLF: 'D AA1 L F', CONSTRUCTOR: 'K AH0 N' }

describe('resolveSoundsLike', () => {
  it('joins the CMU symbols of the known parts', () => {
    expect(resolveSoundsLike('  roo   dolf ', {}, DICTIONARY)).toEqual({
      ok: true,
      symbols: 'R UW1 D AA1 L F',
    })
  })

  it('reads a part from the custom dictionary before the dictionary', () => {
    expect(resolveSoundsLike('ROO', { ROO: 'R UH1' }, DICTIONARY)).toEqual({
      ok: true,
      symbols: 'R UH1',
    })
  })

  it('names the first unknown part in upper case', () => {
    expect(resolveSoundsLike('roo roodolf zxqv', {}, DICTIONARY)).toEqual({
      ok: false,
      unknown: 'ROODOLF',
    })
  })

  it('names a part with only punctuation as typed', () => {
    expect(resolveSoundsLike('roo -', {}, DICTIONARY)).toEqual({ ok: false, unknown: '-' })
  })

  it('gives an empty unknown part for a spelling with no part', () => {
    expect(resolveSoundsLike('   ', {}, DICTIONARY)).toEqual({ ok: false, unknown: '' })
  })

  it('finds no Object.prototype name', () => {
    expect(resolveSoundsLike('toString', {}, {})).toEqual({ ok: false, unknown: 'TOSTRING' })
  })
})
