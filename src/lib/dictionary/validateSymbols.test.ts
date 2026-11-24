import { describe, expect, it } from 'vitest'
import { validateSymbols } from './validateSymbols.ts'

describe('validateSymbols', () => {
  it('accepts R UW1 D AA0 L F', () => {
    expect(validateSymbols('R UW1 D AA0 L F')).toEqual({ ok: true })
  })

  it('accepts extra spaces between, before and after the symbols', () => {
    expect(validateSymbols('  R  UW1   D ')).toEqual({ ok: true })
  })

  it('names XX as the bad symbol', () => {
    expect(validateSymbols('R XX UW1')).toEqual({ ok: false, bad: 'XX' })
  })

  it('names the first bad symbol when there are two', () => {
    expect(validateSymbols('QQ R ZZ')).toEqual({ ok: false, bad: 'QQ' })
  })

  it('names a consonant with a stress digit as bad', () => {
    expect(validateSymbols('L1')).toEqual({ ok: false, bad: 'L1' })
  })

  it('names a symbol in lower case as bad', () => {
    expect(validateSymbols('R uw1')).toEqual({ ok: false, bad: 'uw1' })
  })

  it('rejects a text with no symbols', () => {
    expect(validateSymbols('   ')).toEqual({ ok: false, bad: '' })
  })
})
