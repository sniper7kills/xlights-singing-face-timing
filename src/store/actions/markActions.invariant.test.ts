import { describe, expect, it, vi } from 'vitest'
import { emptyHistory } from '../history.ts'
import type { Layer, Mark } from '../types.ts'
import {
  CALLS_PER_ROUND,
  DICTIONARY,
  DURATION_MS,
  generateSong,
  LABELS,
  PHONEME_LABELS,
  pick,
  type Random,
  SEEDS,
  seeded,
  STEPS_PER_ROUND,
  violations,
} from './invariant.test-helpers.ts'

const LAYERS: readonly Layer[] = ['phrase', 'word', 'phoneme']

async function loadModules(withDictionary: boolean) {
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(DICTIONARY)),
  )
  const { useSongStore } = await import('../songStore.ts')
  const { loadDictionaries } = await import('./breakDown.ts')
  if (withDictionary) await loadDictionaries()
  return {
    useSongStore,
    ...(await import('./moveMark.ts')),
    ...(await import('./resizeMark.ts')),
    ...(await import('./splitMark.ts')),
    ...(await import('./mergeWithNext.ts')),
    ...(await import('./deleteMarks.ts')),
    ...(await import('./addMark.ts')),
    ...(await import('./setMarkLabel.ts')),
    ...(await import('./setPhonemeLabel.ts')),
  }
}

type Actions = Awaited<ReturnType<typeof loadModules>>

/** Returns a label for the layer: a phoneme label, one word, a line of words, or sometimes only spaces. */
function randomLabel(random: Random, layer: Layer): string {
  if (random() < 0.05) return '   '
  if (layer === 'phoneme') return pick(random, PHONEME_LABELS)
  if (layer === 'word') return pick(random, LABELS)
  const count = 1 + Math.floor(random() * 4)
  return Array.from({ length: count }, () => pick(random, LABELS)).join(' ')
}

/** Calls one random action on a random mark, with arguments that are legal, past a limit or not possible. */
function randomAction(random: Random, actions: Actions, mark: Mark, other: Mark): void {
  const choice = Math.floor(random() * 9)
  const length = mark.endMs - mark.startMs
  const timeNear = () => mark.startMs - 200 + random() * (length + 400)
  if (choice === 0) actions.moveMark(mark.id, (random() * 2 - 1) * 1500)
  else if (choice === 1)
    actions.resizeMark(mark.id, random() < 0.5 ? 'start' : 'end', random() * DURATION_MS)
  else if (choice === 2) actions.splitMark(mark.id, timeNear())
  else if (choice === 3) actions.mergeWithNext(mark.id)
  else if (choice === 4) actions.deleteMarks([mark.id])
  else if (choice === 5) {
    const layer = pick(random, LAYERS)
    const startMs = random() * DURATION_MS
    actions.addMark(
      mark.voiceId,
      layer,
      startMs,
      startMs + random() * 2000,
      randomLabel(random, layer),
    )
  } else if (choice === 6) actions.setMarkLabel(mark.id, randomLabel(random, mark.layer))
  else if (choice === 7)
    actions.setPhonemeLabel(mark.id, pick(random, ['AI', 'E', 'etc', 'MBP', 'O', 'rest'] as const))
  else actions.deleteMarks([mark.id, other.id])
}

describe.each([
  { dictionary: 'not loaded', withDictionary: false },
  { dictionary: 'loaded', withDictionary: true },
])('random edit actions with the dictionary $dictionary', ({ withDictionary }) => {
  it.each(SEEDS)(
    'keeps every rule after each action and undo restores the first state, seed %i',
    async (seed) => {
      const actions = await loadModules(withDictionary)
      const { useSongStore } = actions
      const random = seeded(seed)
      const first = generateSong(random)
      expect(violations(first)).toEqual([])
      useSongStore.setState({ current: structuredClone(first), history: emptyHistory() })

      const steps = () => useSongStore.getState().history.past.length
      for (let call = 0; call < CALLS_PER_ROUND && steps() < STEPS_PER_ROUND; call += 1) {
        const marks = useSongStore.getState().current?.marks ?? []
        if (marks.length === 0) actions.addMark('lead', 'word', 1000, 2000, 'night')
        else randomAction(random, actions, pick(random, marks), pick(random, marks))
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
