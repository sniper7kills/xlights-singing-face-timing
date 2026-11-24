import { beforeEach, describe, expect, it, vi } from 'vitest'

// The in-memory copy stays for the whole visit, so each test imports a fresh module.
async function importEntries() {
  vi.resetModules()
  const entries = await import('./customEntries.ts')
  const db = await import('./db.ts')
  return { ...entries, db }
}

let api: Awaited<ReturnType<typeof importEntries>>

beforeEach(async () => {
  api = await importEntries()
})

describe('custom entries', () => {
  it('lists no entry and gives an empty copy for a new database', async () => {
    expect(await api.listCustomEntries()).toEqual([])
    expect(await api.customDictionary()).toEqual({})
  })

  it('reads the saved entries into the copy on the first call', async () => {
    await api.db.putCustomEntryRecords([
      { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F', updatedAt: '2026-11-01T10:00:00.000Z' },
    ])

    expect(await api.customDictionary()).toEqual({ RUDOLPH: 'R UW1 D AA0 L F' })
  })

  it('saves an entry with the time of the save and adds it to the copy', async () => {
    await api.customDictionary()

    await api.putCustomEntry({ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' })

    const [saved] = await api.listCustomEntries()
    expect(saved).toMatchObject({ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' })
    expect(Date.parse(saved?.updatedAt ?? '')).not.toBeNaN()
    expect(await api.customDictionary()).toEqual({ RUDOLPH: 'R UW1 D AA0 L F' })
  })

  it('replaces the entry with the same word in a batch save and lists the entries in word order', async () => {
    await api.putCustomEntry({ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' })

    await api.putCustomEntries([
      { word: 'ZXQV', symbols: 'Z K S' },
      { word: 'RUDOLPH', symbols: 'R UW1 D UW0' },
    ])

    expect((await api.listCustomEntries()).map(({ word, symbols }) => [word, symbols])).toEqual([
      ['RUDOLPH', 'R UW1 D UW0'],
      ['ZXQV', 'Z K S'],
    ])
    expect(await api.customDictionary()).toEqual({ RUDOLPH: 'R UW1 D UW0', ZXQV: 'Z K S' })
  })

  it('normalises the word of an entry before the save', async () => {
    await api.putCustomEntry({ word: 'Rudolph!', symbols: 'R UW1 D AA0 L F' })

    expect((await api.listCustomEntries()).map((entry) => entry.word)).toEqual(['RUDOLPH'])
    expect(await api.customDictionary()).toEqual({ RUDOLPH: 'R UW1 D AA0 L F' })
  })

  it.each(['12', '--', '', "'"])(
    'rejects the word "%s" with CustomEntryWordError and saves nothing',
    async (word) => {
      await expect(api.putCustomEntry({ word, symbols: 'R UW1' })).rejects.toBeInstanceOf(
        api.CustomEntryWordError,
      )
      expect(await api.listCustomEntries()).toEqual([])
    },
  )

  it('skips an entry whose word has no letter in a batch save and returns its word', async () => {
    const skipped = await api.putCustomEntries([
      { word: '12', symbols: 'T' },
      { word: 'zxqv', symbols: 'Z K S' },
      { word: '!?', symbols: 'T' },
      { word: "'", symbols: 'T' },
    ])

    expect(skipped).toEqual(['12', '!?', "'"])
    expect((await api.listCustomEntries()).map((entry) => entry.word)).toEqual(['ZXQV'])
  })

  it('keeps one record, with the later symbols, for two words that normalise to the same word', async () => {
    await api.putCustomEntries([
      { word: 'Rudolph', symbols: 'R UW1 D AA0 L F' },
      { word: 'RUDOLPH!', symbols: 'R UW1 D UW0' },
    ])

    expect((await api.listCustomEntries()).map(({ word, symbols }) => [word, symbols])).toEqual([
      ['RUDOLPH', 'R UW1 D UW0'],
    ])
  })

  it('deletes an entry and removes it from the copy', async () => {
    await api.putCustomEntries([
      { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' },
      { word: 'ZXQV', symbols: 'Z K S' },
    ])

    await api.deleteCustomEntry('RUDOLPH')

    expect((await api.listCustomEntries()).map((entry) => entry.word)).toEqual(['ZXQV'])
    expect(await api.customDictionary()).toEqual({ ZXQV: 'Z K S' })
  })

  it('reads the database again after a failed read', async () => {
    const read = vi.spyOn(api.db, 'listRecords').mockRejectedValueOnce(new Error('locked'))

    await expect(api.customDictionary()).rejects.toThrow('locked')
    expect(await api.customDictionary()).toEqual({})
    expect(read).toHaveBeenCalledTimes(2)
  })
})
