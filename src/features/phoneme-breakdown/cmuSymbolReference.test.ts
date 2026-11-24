import { describe, expect, it } from 'vitest'
import { CMU_SYMBOLS } from '../../lib/dictionary/cmuSymbols.ts'
import { CMU_SYMBOL_REFERENCE } from './cmuSymbolReference.ts'

describe('CMU_SYMBOL_REFERENCE', () => {
  it('has one row with an example word for each CMU symbol, in the order of the symbol list', () => {
    expect(CMU_SYMBOL_REFERENCE.map((row) => row.symbol)).toEqual(
      CMU_SYMBOLS.map((entry) => entry.symbol),
    )
    for (const row of CMU_SYMBOL_REFERENCE) expect(row.example).not.toBe('')
  })

  it('keeps the phoneme label of each symbol', () => {
    expect(CMU_SYMBOL_REFERENCE.find((row) => row.symbol === 'AY')).toMatchObject({
      label: 'AI',
      example: 'hide',
    })
  })
})
