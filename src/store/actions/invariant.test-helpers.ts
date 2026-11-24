import { HISTORY_DEPTH } from '../history.ts'
import type { Mark, SongContent } from '../types.ts'

// The random song and the rule check of the invariant tests of the mark actions.
export const FRAME_MS = 50
export const DURATION_MS = 30_000
const FRAMES = DURATION_MS / FRAME_MS
export const LABELS = ['silent', 'night', 'holy', 'zxqv']
export const PHONEME_LABELS = ['AI', 'E', 'etc', 'FV', 'L', 'MBP', 'O', 'U', 'WQ']
export const DICTIONARY = { SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T', HOLY: 'HH OW1 L IY0' }
export const CALLS_PER_ROUND = 300
// The history keeps HISTORY_DEPTH steps, so a round stops before the first step goes.
export const STEPS_PER_ROUND = HISTORY_DEPTH - 1
export const SEEDS = [1, 27, 4242, 90_210]

/** Returns a seeded generator of numbers from 0 to 1, so that a failure can be reproduced (mulberry32). */
export function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Random = () => number
export const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))
export const pick = <T>(random: Random, items: readonly T[]): T =>
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

function generatePhrase(
  random: Random,
  voiceId: string,
  start: number,
  frames: number,
  idPrefix = voiceId,
): Mark[] {
  const id = `${idPrefix}-p${start}`
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

/**
 * Returns the marks of a random transcribe run: one phrase that fills the frames inside the range, with words and phonemes.
 * Returns no mark when the range holds no full frame.
 * @param idPrefix Makes the ids unique, because a round can run more than one range replace.
 */
export function generateRunMarks(
  random: Random,
  voiceId: string,
  range: { startMs: number; endMs: number },
  idPrefix: string,
): Mark[] {
  const first = Math.ceil(range.startMs / FRAME_MS)
  const last = Math.floor(range.endMs / FRAME_MS)
  return last > first ? generatePhrase(random, voiceId, first, last - first, idPrefix) : []
}

/** Returns a song with two voices. Each voice has phrases with gaps or shared edges, words and phonemes. */
export function generateSong(random: Random): SongContent {
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
export function violations(content: SongContent): string[] {
  const byId = new Map(content.marks.map((mark) => [mark.id, mark]))
  const found = content.marks.flatMap((mark) => markViolations(mark, byId))
  const parents = new Set(content.marks.map((mark) => mark.parentId))
  for (const mark of content.marks)
    if (mark.layer === 'word' && !parents.has(mark.id)) found.push(`${mark.id} has no phoneme`)
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
