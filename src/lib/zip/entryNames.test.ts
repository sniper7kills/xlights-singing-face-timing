import { describe, expect, it } from 'vitest'
import { entryPath, safeEntryName, uniquePathMaker } from './entryNames.ts'

describe('safeEntryName', () => {
  it('replaces a slash and a backslash with _', () => {
    expect(safeEntryName('AC/DC\\live.ogg')).toBe('AC_DC_live.ogg')
  })

  it('replaces control characters and the characters that Windows refuses', () => {
    expect(safeEntryName('a\u0000b\nc\u007fd:*?"<>|.ogg')).toBe('a_b_c_d_______.ogg')
  })

  it('keeps the Unicode characters that are not control characters', () => {
    expect(safeEntryName('Noël – 雪 🎄.ogg')).toBe('Noël – 雪 🎄.ogg')
  })

  it('replaces a dot at the start, so no name is hidden, "." or ".."', () => {
    expect(safeEntryName('.hidden')).toBe('_hidden')
    expect(safeEntryName('..')).toBe('_.')
  })

  it('gives _ for an empty name', () => {
    expect(safeEntryName('')).toBe('_')
  })
})

describe('entryPath', () => {
  it('puts the safe name in the folder', () => {
    expect(entryPath('audio', '../x/song.ogg')).toBe('audio/_._x_song.ogg')
  })

  it('gives the safe name alone for the top of the zip file', () => {
    expect(entryPath(null, 'song.json')).toBe('song.json')
  })
})

describe('uniquePathMaker', () => {
  it('adds a number before the extension of a path that an earlier path has', () => {
    const unique = uniquePathMaker()

    expect(['song.json', 'song.json', 'song.json'].map(unique)).toEqual([
      'song.json',
      'song (2).json',
      'song (3).json',
    ])
  })

  it('treats two paths that differ in case only as one path', () => {
    const unique = uniquePathMaker()

    expect(['timing/A.xtiming', 'timing/a.xtiming'].map(unique)).toEqual([
      'timing/A.xtiming',
      'timing/a (2).xtiming',
    ])
  })

  it('adds the number at the end of a name with no extension', () => {
    const unique = uniquePathMaker()

    expect(['v1.0/notes', 'v1.0/notes'].map(unique)).toEqual(['v1.0/notes', 'v1.0/notes (2)'])
  })

  it('skips a number that an earlier path has', () => {
    const unique = uniquePathMaker()

    expect(['a (2).txt', 'a.txt', 'a.txt'].map(unique)).toEqual(['a (2).txt', 'a.txt', 'a (3).txt'])
  })
})
