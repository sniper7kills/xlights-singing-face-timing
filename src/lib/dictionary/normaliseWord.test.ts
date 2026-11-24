import { describe, expect, it } from 'vitest'
import { normaliseWord } from './normaliseWord.ts'

describe('normaliseWord', () => {
  it('changes the label to upper case', () => {
    expect(normaliseWord('Hello')).toBe('HELLO')
  })

  it('removes punctuation and spaces', () => {
    expect(normaliseWord(' "Hello," ')).toBe('HELLO')
  })

  it('keeps digits and apostrophes', () => {
    expect(normaliseWord("singin'")).toBe("SINGIN'")
    expect(normaliseWord('4th')).toBe('4TH')
  })

  it('removes a letter with an accent, because the dictionary has only A to Z', () => {
    expect(normaliseWord('café')).toBe('CAF')
  })

  it('gives an empty key for a label with only punctuation', () => {
    expect(normaliseWord('-')).toBe('')
  })
})
