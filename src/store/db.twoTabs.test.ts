import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { violations } from './actions/invariant.test-helpers.ts'
import * as tabA from './db.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import type { Mark, SongContent } from './types.ts'

// Each tab of the app has its own copy of the db module, so the second tab is a second module instance.
type DbModule = typeof tabA
let tabB: DbModule

beforeEach(async () => {
  vi.resetModules()
  tabB = await import('./db.ts')
})

afterEach(async () => {
  await tabB.closeDatabase()
})

function mark(
  id: string,
  layer: Mark['layer'],
  startMs: number,
  endMs: number,
  parentId: string | null,
): Mark {
  return { id, voiceId: 'song-1-voice', layer, label: id, startMs, endMs, parentId, edited: false }
}

/** Returns a word with one phoneme of the same time, so that the word keeps the mark rules. */
function word(id: string, startMs: number, endMs: number, parentId = 'p1'): Mark[] {
  return [
    mark(id, 'word', startMs, endMs, parentId),
    mark(`${id}-ph`, 'phoneme', startMs, endMs, id),
  ]
}

/** Returns the song with one phrase from 0 to 3000 ms and the words `w1` (0 to 1000 ms) and `w2` (1000 to 2000 ms). */
function startContent(): SongContent {
  const base = makeSongContent()
  return {
    ...base,
    marks: [mark('p1', 'phrase', 0, 3000, null), ...word('w1', 0, 1000), ...word('w2', 1000, 2000)],
  }
}

async function openInBothTabs(): Promise<[SongContent, SongContent]> {
  await tabA.saveSong(startContent())
  const a = await tabA.loadSong('song-1')
  const b = await tabB.loadSong('song-1')
  if (!a || !b) throw new Error('The song did not load.')
  return [a, b]
}

const ids = (marks: Mark[]) => marks.map((item) => item.id).sort()

async function expectStoredEquals(content: SongContent) {
  const stored = await tabA.loadSong('song-1')
  expect(ids(stored?.marks ?? [])).toEqual(ids(content.marks))
  expect(stored?.marks).toEqual(expect.arrayContaining(content.marks))
  expect(violations({ ...content, marks: stored?.marks ?? [] })).toEqual([])
}

describe('two tabs that save the same song', () => {
  it('keeps the marks of the tab that saves last when the earlier tab replaced a word', async () => {
    const [a, b] = await openInBothTabs()
    const bMarks = [
      ...b.marks.filter((item) => !item.id.startsWith('w2')),
      ...word('w3', 1000, 2000),
    ]
    await tabB.saveSong({ ...b, marks: bMarks })

    const aMarks = [mark('p1', 'phrase', 0, 3000, null), ...word('w2', 500, 1500)]
    const aState = { ...a, marks: aMarks }
    await tabA.saveSong(aState)

    await expectStoredEquals(aState)
  })

  it('keeps the marks of the tab that saves last after a replace in that tab and new marks in the other tab', async () => {
    const [a, b] = await openInBothTabs()
    const added = [mark('p2', 'phrase', 4000, 6000, null), ...word('w9', 4000, 5000, 'p2')]
    await tabB.saveSong({ ...b, marks: [...b.marks, ...added] })

    const aState = {
      ...a,
      marks: [
        mark('p1', 'phrase', 0, 3000, null),
        ...word('n1', 0, 1500),
        ...word('n2', 1500, 3000),
      ],
    }
    await tabA.saveSong(aState)

    await expectStoredEquals(aState)
  })

  it('leaves no word without its phrase when one tab deletes the phrase and the other tab adds a word under it', async () => {
    const [a, b] = await openInBothTabs()
    await tabB.saveSong({ ...b, marks: [...b.marks, ...word('w4', 2000, 3000)] })

    const aState = { ...a, marks: [] }
    await tabA.saveSong(aState)

    await expectStoredEquals(aState)
  })

  it('reads the stored keys for a save of a page that unloads after a different tab saved the song', async () => {
    const [a, b] = await openInBothTabs()
    await tabB.saveSong({ ...b, marks: [...b.marks, ...word('w4', 2000, 3000)] })
    tabA.forgetStoredIds('song-1')
    const commit = vi.spyOn(IDBTransaction.prototype, 'commit')

    await tabA.saveSong(a, undefined, { unloading: true })

    expect(commit).not.toHaveBeenCalled()
    await expectStoredEquals(a)
  })
})
