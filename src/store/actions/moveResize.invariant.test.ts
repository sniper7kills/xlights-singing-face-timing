import { describe, expect, it, vi } from 'vitest'
import { emptyHistory, HISTORY_DEPTH } from '../history.ts'
import type { Mark, SongContent } from '../types.ts'

const FRAME_MS = 50
const DURATION_MS = 30_000
const FRAMES = DURATION_MS / FRAME_MS
const LABELS = ['silent', 'night', 'holy', 'zxqv']
const PHONEME_LABELS = ['AI', 'E', 'etc', 'FV', 'L', 'MBP', 'O', 'U', 'WQ']
const DICTIONARY = { SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T', HOLY: 'HH OW1 L IY0' }
const CALLS_PER_ROUND = 300
// The history keeps HISTORY_DEPTH steps, so a round stops before the first step goes.
const STEPS_PER_ROUND = HISTORY_DEPTH - 1
const SEEDS = [1, 27, 4242, 90_210]

/** Returns a seeded generator of numbers from 0 to 1, so that a failure can be reproduced (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Random = () => number
const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))
const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T

function generateWord(
  random: Random,
  voiceId: string,
  phraseId: string,
  start: number,
  frames: number,
): Mark[] {
  const id = `${phraseId}-w${start}`
  const word: Mark = {
    id,
    voiceId,
    layer: 'word',
    label: pick(random, LABELS),
    startMs: start * FRAME_MS,
    endMs: (start + frames) * FRAME_MS,
    parentId: phraseId,
    edited: random() < 0.3,
    estimated: random() < 0.3,
  }
  const count = between(random, 1, Math.min(4, frames))
  const phonemes = Array.from({ length: count }, (_, index): Mark => {
    const from = start + Math.floor((frames * index) / count)
    const to = start + Math.floor((frames * (index + 1)) / count)
    return {
      id: `${id}-p${index}`,
      voiceId,
      layer: 'phoneme',
      label: pick(random, PHONEME_LABELS),
      startMs: from * FRAME_MS,
      endMs: to * FRAME_MS,
      parentId: id,
      edited: false,
    }
  })
  return [word, ...phonemes]
}

function generatePhrase(random: Random, voiceId: string, start: number, frames: number): Mark[] {
  const id = `${voiceId}-p${start}`
  const marks: Mark[] = [
    {
      id,
      voiceId,
      layer: 'phrase',
      label: 'line',
      startMs: start * FRAME_MS,
      endMs: (start + frames) * FRAME_MS,
      parentId: null,
      edited: false,
    },
  ]
  let at = start + between(random, 0, 2)
  for (;;) {
    const length = between(random, 1, 10)
    if (at + length > start + frames) return marks
    marks.push(...generateWord(random, voiceId, id, at, length))
    at += length + between(random, 0, 2)
  }
}

/** Returns a song with two voices. Each voice has phrases with gaps or shared edges, words and phonemes. */
function generateSong(random: Random): SongContent {
  const voices = ['lead', 'backing']
  const marks: Mark[] = []
  for (const voiceId of voices) {
    let at = between(random, 0, 10)
    for (
      let length = between(random, 4, 60);
      at + length <= FRAMES;
      length = between(random, 4, 60)
    ) {
      marks.push(...generatePhrase(random, voiceId, at, length))
      at += length + between(random, 0, 10)
    }
  }
  return {
    song: {
      id: 'song',
      name: 'Generated',
      durationMs: DURATION_MS,
      frameMs: FRAME_MS,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    voices: voices.map((id, order) => ({ id, songId: 'song', name: id, order, color: '#e05d5d' })),
    sections: [],
    marks,
  }
}

const PARENT_LAYER = { phrase: null, word: 'phrase', phoneme: 'word' } as const

function timeViolations(mark: Mark): string[] {
  const found: string[] = []
  if (mark.startMs % FRAME_MS !== 0 || mark.endMs % FRAME_MS !== 0)
    found.push(`${mark.id} is not on a frame`)
  if (mark.endMs - mark.startMs < FRAME_MS) found.push(`${mark.id} is shorter than one frame size`)
  if (mark.startMs < 0 || mark.endMs > DURATION_MS) found.push(`${mark.id} is outside the song`)
  return found
}

function markViolations(mark: Mark, byId: ReadonlyMap<string, Mark>): string[] {
  const found = timeViolations(mark)
  const parent = mark.parentId === null ? undefined : byId.get(mark.parentId)
  if ((parent?.layer ?? null) !== PARENT_LAYER[mark.layer])
    found.push(`${mark.id} has no ${PARENT_LAYER[mark.layer]} parent`)
  if (parent && (mark.startMs < parent.startMs || mark.endMs > parent.endMs))
    found.push(`${mark.id} is outside its parent`)
  return found
}

/** Returns a text for each broken rule, so a failure names the marks. */
function violations(content: SongContent): string[] {
  const byId = new Map(content.marks.map((mark) => [mark.id, mark]))
  const found = content.marks.flatMap((mark) => markViolations(mark, byId))
  const ordered = content.marks.toSorted((a, b) => a.startMs - b.startMs)
  const last = new Map<string, Mark>()
  for (const mark of ordered) {
    const key = `${mark.voiceId}/${mark.layer}`
    const previous = last.get(key)
    if (previous && previous.endMs > mark.startMs) found.push(`${previous.id} overlaps ${mark.id}`)
    last.set(key, mark)
  }
  return found
}

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
