import { describe, expect, it } from 'vitest'
import { matchWords } from './matchWords.ts'

describe('matchWords', () => {
  it('matches each target word to the source word at the same place in the common sequence', () => {
    expect(matchWords(['silent', 'night', 'holy'], ['silent', 'holy'])).toEqual([0, 2])
  })

  it('gives -1 to a target word with no match', () => {
    expect(matchWords(['silent', 'night'], ['silent', 'day', 'night'])).toEqual([0, -1, 1])
  })

  it('gives an empty list for no target word', () => {
    expect(matchWords(['silent'], [])).toEqual([])
  })
})
