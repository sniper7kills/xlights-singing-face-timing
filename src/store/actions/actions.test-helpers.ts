import { vi } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark } from '../types.ts'

export const DICTIONARY = {
  SILENT: 'S AY1 L AH0 N T',
  NIGHT: 'N AY1 T',
  HOLY: 'HH OW1 L IY0',
  DAY: 'D EY1',
}

export type Store = typeof useSongStore

/** Returns the marks of the open song in the store. */
export const marksOf = (store: Store = useSongStore): Mark[] =>
  store.getState().current?.marks ?? []

/** Returns the mark with the id in the open song. */
export const find = (id: string, store: Store = useSongStore): Mark | undefined =>
  marksOf(store).find((item) => item.id === id)

/** Returns the children of the mark in time order. */
export const childrenIn = (parentId: string, store: Store = useSongStore): Mark[] =>
  marksOf(store)
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.startMs - b.startMs)

/** Returns the number of undo steps. */
export const steps = (store: Store = useSongStore): number => store.getState().history.past.length

/** Opens the test song in the store with an empty history. */
export function openTestSong(store: Store = useSongStore): void {
  store.setState({ current: testContent(), history: emptyHistory() })
}

/**
 * Returns fresh store modules with the dictionary in memory and the test song open.
 * The loader keeps the dictionary for the whole visit, so a test with a loaded dictionary imports fresh modules.
 * @param load Imports the action module, for example `() => import('./splitMark.ts')`.
 */
export async function withDictionary<T>(
  load: () => Promise<T>,
): Promise<{ store: Store; actions: T }> {
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(DICTIONARY)),
  )
  const store = (await import('../songStore.ts')).useSongStore
  await (await import('./breakDown.ts')).loadDictionaries()
  openTestSong(store)
  return { store, actions: await load() }
}
