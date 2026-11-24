import { describe, expect, it } from 'vitest'
import { parseHash } from './routes.ts'

describe('parseHash', () => {
  it.each(['', '#', '#/'])('returns the song library for the hash "%s"', (hash) => {
    expect(parseHash(hash)).toEqual({ name: 'library' })
  })

  it('returns null for an unknown hash', () => {
    expect(parseHash('#/unknown')).toBeNull()
  })
})
