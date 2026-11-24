import { describe, expect, it } from 'vitest'
import { parseHash, songHash } from './routes.ts'

describe('parseHash', () => {
  it.each(['', '#', '#/'])('returns the song library for the hash "%s"', (hash) => {
    expect(parseHash(hash)).toEqual({ name: 'library' })
  })

  it('returns null for an unknown hash', () => {
    expect(parseHash('#/unknown')).toBeNull()
  })
})

describe('songHash', () => {
  it('returns the editor route of a song, and parseHash reads the id back', () => {
    const songId = '0b6e7c1a-9f4d-4c2e-8a4b-2f1d3e5c7a90'
    expect(songHash(songId)).toBe(`#/song/${songId}`)
    expect(parseHash(songHash(songId))).toEqual({ name: 'song', songId })
  })

  it.each(['#/song/', '#/song/a/b', '#/song/a%20b'])('returns null for the hash "%s"', (hash) => {
    expect(parseHash(hash)).toBeNull()
  })
})
