import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mark, SongContent } from '../types.ts'

const DICTIONARY = {
  SILENT: 'S AY1 L AH0 N T',
  NIGHT: 'N AY1 T',
  RUDOLPH: 'R UW1 D AA0 L F',
  SINGING: 'S IH1 NG IH0 NG',
}

const SONG_ID = 'song-1'
const LEAD = 'voice-lead'
const BACKING = 'voice-backing'

function mark(id: string, fields: Partial<Mark>): Mark {
  return {
    id,
    voiceId: LEAD,
    layer: 'word',
    label: id,
    startMs: 0,
    endMs: 500,
    parentId: 'phrase',
    edited: false,
    ...fields,
  }
}

// The hand-edited phoneme of the edited word `night`.
const HAND_PHONEME = mark('hand', {
  layer: 'phoneme',
  label: 'O',
  startMs: 2000,
  endMs: 2500,
  parentId: 'night',
})

function songContent(): SongContent {
  return {
    song: {
      id: SONG_ID,
      name: 'carol',
      durationMs: 10_000,
      frameMs: 50,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    voices: [
      { id: LEAD, songId: SONG_ID, name: 'Lead', order: 0, color: '#e05d5d' },
      { id: BACKING, songId: SONG_ID, name: 'Backing', order: 1, color: '#5d5de0' },
    ],
    sections: [],
    marks: [
      mark('phrase', { layer: 'phrase', label: 'silent night', endMs: 3000, parentId: null }),
      mark('silent', { label: 'Silent', startMs: 0, endMs: 900 }),
      mark('zxqv', { label: 'Zxqv', startMs: 1000, endMs: 1500 }),
      mark('rudolph', { label: 'Rudolph,', startMs: 1500, endMs: 2000 }),
      mark('night', { label: 'night', startMs: 2000, endMs: 2500, edited: true }),
      HAND_PHONEME,
      mark('singin', { label: "singin'", startMs: 2500, endMs: 3000 }),
      mark('backing-phrase', { voiceId: BACKING, layer: 'phrase', parentId: null, endMs: 1000 }),
      mark('backing-rudolph', { voiceId: BACKING, label: 'RUDOLPH', parentId: 'backing-phrase' }),
    ],
  }
}

// The loader and the custom dictionary keep their data for the whole visit, so each test imports fresh modules.
async function setup(fetchResult: () => Promise<Response> = async () => Response.json(DICTIONARY)) {
  vi.resetModules()
  const fetch = vi.fn(fetchResult)
  vi.stubGlobal('fetch', fetch)
  const { useSongStore } = await import('../songStore.ts')
  const { saveSong } = await import('../db.ts')
  const actions = await import('./breakDown.ts')
  const entries = await import('../customEntries.ts')
  const { DictionaryLoadError } = await import('../../features/phoneme-breakdown/loadDictionary.ts')
  await saveSong(songContent())
  await useSongStore.getState().openSong(SONG_ID)
  const marks = () => useSongStore.getState().current?.marks ?? []
  const phonemesOf = (wordId: string) => marks().filter((item) => item.parentId === wordId)
  const word = (id: string) => marks().find((item) => item.id === id)
  return { fetch, useSongStore, actions, entries, DictionaryLoadError, marks, phonemesOf, word }
}

const labels = (marks: Mark[]) => marks.map((item) => item.label)

// The database returns the marks of a song in no fixed order.
const byId = (marks: readonly Mark[] = []) => [...marks].sort((a, b) => a.id.localeCompare(b.id))

describe('phonemesForWord', () => {
  let actions: Awaited<ReturnType<typeof setup>>['actions']
  const dictionaries = { custom: {}, cmu: DICTIONARY }

  beforeEach(async () => {
    ;({ actions } = await setup())
  })

  it('gives a dictionary word phoneme marks that are children of the word on its voice', () => {
    const word = mark('silent', { label: 'Silent', voiceId: BACKING, startMs: 0, endMs: 900 })

    const result = actions.phonemesForWord(word, dictionaries, 50)

    expect(labels(result.phonemes)).toEqual(['etc', 'AI', 'L', 'AI', 'etc'])
    expect(result.word).toEqual({ ...word, unknown: false })
    for (const phoneme of result.phonemes)
      expect(phoneme).toMatchObject({
        layer: 'phoneme',
        parentId: 'silent',
        voiceId: BACKING,
        edited: false,
      })
    expect(new Set(result.phonemes.map((phoneme) => phoneme.id)).size).toBe(5)
  })

  it('fills the word with no gap, at multiples of the frame size, with no rest phoneme', () => {
    const word = mark('silent', { label: 'Silent', startMs: 1050, endMs: 1975 })

    const { phonemes } = actions.phonemesForWord(word, dictionaries, 25)

    expect(phonemes[0]?.startMs).toBe(1050)
    expect(phonemes.at(-1)?.endMs).toBe(1975)
    for (const [index, phoneme] of phonemes.entries()) {
      expect(phoneme.startMs % 25).toBe(0)
      expect(phoneme.endMs % 25).toBe(0)
      if (index > 0) expect(phoneme.startMs).toBe(phonemes[index - 1]?.endMs)
    }
    expect(labels(phonemes)).not.toContain('rest')
  })

  it('takes the custom entry before the dictionary', () => {
    const word = mark('night', { label: 'night' })

    const result = actions.phonemesForWord(
      word,
      { custom: { NIGHT: 'N OW1' }, cmu: DICTIONARY },
      50,
    )

    expect(labels(result.phonemes)).toEqual(['etc', 'O'])
    expect(result.word.unknown).toBe(false)
  })

  it('gives the word Zxqv guessed phonemes and sets unknown', () => {
    const result = actions.phonemesForWord(mark('zxqv', { label: 'Zxqv' }), dictionaries, 50)

    expect(result.phonemes.length).toBeGreaterThan(0)
    expect(result.word.unknown).toBe(true)
  })
})

describe('breakDownMarks', () => {
  it('returns the same array when no word is a target', async () => {
    const { actions } = await setup()
    const marks = songContent().marks

    expect(actions.breakDownMarks(marks, () => false, { custom: {}, cmu: DICTIONARY }, 50)).toBe(
      marks,
    )
  })
})

describe('breakDownWords', () => {
  it('does not request the dictionary before the first break down', async () => {
    const { fetch } = await setup()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('requests the dictionary one time for several break downs of a visit', async () => {
    const { fetch, actions } = await setup()

    await actions.breakDownWords(['silent'])
    await actions.breakDownWords(['zxqv'])

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/dict/cmudict.json')
  })

  it('replaces the phonemes of a selected word with new phonemes, as one undo step', async () => {
    const { actions, phonemesOf, word, useSongStore } = await setup()
    await actions.breakDownWords(['silent'])
    const first = phonemesOf('silent')

    await actions.breakDownWords(['silent'])

    const second = phonemesOf('silent')
    expect(labels(second)).toEqual(['etc', 'AI', 'L', 'AI', 'etc'])
    expect(second.map((item) => item.id)).not.toEqual(first.map((item) => item.id))
    expect(word('silent')?.unknown).toBe(false)
    expect(useSongStore.getState().history.past).toHaveLength(2)

    useSongStore.getState().undo()
    expect(phonemesOf('silent')).toEqual(first)
  })

  it('breaks down several words in one undo step and sets unknown on Zxqv', async () => {
    const { actions, phonemesOf, word, useSongStore } = await setup()

    await actions.breakDownWords(['silent', 'zxqv', 'backing-rudolph'])

    expect(phonemesOf('zxqv').length).toBeGreaterThan(0)
    expect(word('zxqv')?.unknown).toBe(true)
    expect(phonemesOf('backing-rudolph')[0]?.voiceId).toBe(BACKING)
    expect(useSongStore.getState().history.past).toHaveLength(1)

    useSongStore.getState().undo()
    expect(byId(useSongStore.getState().current?.marks)).toEqual(byId(songContent().marks))
  })

  it('keeps the phonemes of an edited word and records no step', async () => {
    const { actions, phonemesOf, useSongStore } = await setup()

    await actions.breakDownWords(['night', 'phrase'])

    expect(phonemesOf('night')).toEqual([HAND_PHONEME])
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('rejects with the edge case copy and keeps the words without phonemes when the dictionary does not load', async () => {
    const { actions, marks, useSongStore, DictionaryLoadError } = await setup(async () => {
      throw new TypeError('offline')
    })

    const result = actions.breakDownWords(['silent'])

    await expect(result).rejects.toBeInstanceOf(DictionaryLoadError)
    await expect(result).rejects.toThrow(
      'The dictionary did not load. Check the connection and retry.',
    )
    expect(byId(marks())).toEqual(byId(songContent().marks))
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})

describe('rebreakForEntries', () => {
  it('breaks down again each unedited matching word in every voice after a custom entry changes', async () => {
    const { actions, entries, phonemesOf, useSongStore } = await setup()
    await actions.breakDownWords(['rudolph', 'backing-rudolph', 'silent'])
    const silent = phonemesOf('silent')

    await entries.putCustomEntry({ word: 'RUDOLPH', symbols: 'R UW1 D UW0' })

    expect(labels(phonemesOf('rudolph'))).toEqual(['etc', 'U', 'etc', 'U'])
    expect(labels(phonemesOf('backing-rudolph'))).toEqual(['etc', 'U', 'etc', 'U'])
    expect(phonemesOf('silent')).toEqual(silent)
    expect(useSongStore.getState().history.past).toHaveLength(2)
  })

  it('returns the matching words to the dictionary result after a custom entry goes', async () => {
    const { entries, phonemesOf } = await setup()
    await entries.putCustomEntry({ word: 'RUDOLPH', symbols: 'R UW1 D UW0' })

    await entries.deleteCustomEntry('RUDOLPH')

    expect(labels(phonemesOf('rudolph'))).toEqual(['etc', 'U', 'etc', 'AI', 'L', 'FV'])
  })

  it('keeps the phonemes of an edited word after a custom entry change', async () => {
    const { entries, phonemesOf } = await setup()

    await entries.putCustomEntry({ word: 'NIGHT', symbols: 'N OW1' })

    expect(phonemesOf('night')).toEqual([HAND_PHONEME])
  })

  it("matches a label that ends in IN' with the entry that ends in ING", async () => {
    const { entries, phonemesOf } = await setup()

    await entries.putCustomEntry({ word: 'SINGING', symbols: 'S IH1 NG' })

    expect(labels(phonemesOf('singin'))).toEqual(['etc', 'AI', 'etc'])
  })

  it('requests no dictionary and records no step when no word matches', async () => {
    const { entries, fetch, useSongStore } = await setup()

    await entries.putCustomEntry({ word: 'HOLLY', symbols: 'HH AA1 L IY0' })

    expect(fetch).not.toHaveBeenCalled()
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('changes nothing when no song is open', async () => {
    const { entries, fetch, useSongStore } = await setup()
    useSongStore.getState().closeSong()

    await entries.putCustomEntry({ word: 'RUDOLPH', symbols: 'R UW1 D UW0' })

    expect(fetch).not.toHaveBeenCalled()
  })
})
