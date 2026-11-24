import { describe, expect, it, vi } from 'vitest'
import { emptyHistory } from '../history.ts'
import {
  CALLS_PER_ROUND,
  DICTIONARY,
  DURATION_MS,
  generateSong,
  pick,
  SEEDS,
  seeded,
  STEPS_PER_ROUND,
  violations,
} from './invariant.test-helpers.ts'

async function loadModules(withDictionary: boolean) {
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(DICTIONARY)),
  )
  const { useSongStore } = await import('../songStore.ts')
  const { loadDictionaries } = await import('./breakDown.ts')
  const { moveMark } = await import('./moveMark.ts')
  const { resizeMark } = await import('./resizeMark.ts')
  if (withDictionary) await loadDictionaries()
  return { useSongStore, moveMark, resizeMark }
}

describe.each([
  { dictionary: 'not loaded', withDictionary: false },
  { dictionary: 'loaded', withDictionary: true },
])('random moves and resizes with the dictionary $dictionary', ({ withDictionary }) => {
  it.each(SEEDS)(
    'keeps every rule after each action and undo restores the first state, seed %i',
    async (seed) => {
      const { useSongStore, moveMark, resizeMark } = await loadModules(withDictionary)
      const random = seeded(seed)
      const first = generateSong(random)
      expect(violations(first)).toEqual([])
      useSongStore.setState({ current: structuredClone(first), history: emptyHistory() })

      const steps = () => useSongStore.getState().history.past.length
      for (let call = 0; call < CALLS_PER_ROUND && steps() < STEPS_PER_ROUND; call += 1) {
        const id = pick(random, useSongStore.getState().current?.marks ?? []).id
        if (random() < 0.5) moveMark(id, (random() * 2 - 1) * 1500)
        else
          resizeMark(id, random() < 0.5 ? 'start' : 'end', random() * (DURATION_MS + 2000) - 1000)
        const current = useSongStore.getState().current
        if (current) expect(violations(current), `seed ${seed}, call ${call}`).toEqual([])
      }

      const recorded = steps()
      expect(recorded).toBe(STEPS_PER_ROUND)
      for (let step = 0; step < recorded; step += 1) useSongStore.getState().undo()
      expect(useSongStore.getState().current).toStrictEqual(first)
    },
  )
})
