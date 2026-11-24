import type { Mark, SongContent } from '../../store/types.ts'

export const FRAME_MS = 50
export const DURATION_MS = 10_000
export const VOICE = 'voice-lead'
export const OTHER_VOICE = 'voice-backing'

/** Returns a mark with test defaults: a word of the lead voice. */
export function mark(id: string, fields: Partial<Mark>): Mark {
  return {
    id,
    voiceId: VOICE,
    layer: 'word',
    label: id,
    startMs: 0,
    endMs: 500,
    parentId: null,
    edited: false,
    ...fields,
  }
}

function phoneme(
  id: string,
  parentId: string,
  label: string,
  startMs: number,
  endMs: number,
): Mark {
  return mark(id, { layer: 'phoneme', label, startMs, endMs, parentId })
}

/**
 * Returns the marks of a test song with a 50 ms frame size and a length of 10 000 ms.
 *
 * The lead voice:
 * - `p1` 1000–3000 with the words `w1` 1000–1500, `w2` 1500–2000 and `w3` 2200–2800.
 * - `p2` 3000–5000 with the edited word `w4` 3200–4000 and its three phonemes.
 * - `p3` 6000–7000 with no words.
 *
 * The backing voice has the phrase `q1` 0–2000, which overlaps `p1` in time on a different voice.
 */
export function testMarks(): Mark[] {
  return [
    mark('p1', { layer: 'phrase', label: 'silent night holy', startMs: 1000, endMs: 3000 }),
    mark('w1', { label: 'silent', startMs: 1000, endMs: 1500, parentId: 'p1' }),
    phoneme('w1a', 'w1', 'etc', 1000, 1250),
    phoneme('w1b', 'w1', 'AI', 1250, 1500),
    mark('w2', { label: 'night', startMs: 1500, endMs: 2000, parentId: 'p1' }),
    phoneme('w2a', 'w2', 'etc', 1500, 1600),
    phoneme('w2b', 'w2', 'AI', 1600, 2000),
    mark('w3', { label: 'holy', startMs: 2200, endMs: 2800, parentId: 'p1', estimated: true }),
    phoneme('w3a', 'w3', 'etc', 2200, 2400),
    phoneme('w3b', 'w3', 'O', 2400, 2600),
    phoneme('w3c', 'w3', 'L', 2600, 2800),
    mark('p2', { layer: 'phrase', label: 'night', startMs: 3000, endMs: 5000 }),
    mark('w4', { label: 'night', startMs: 3200, endMs: 4000, parentId: 'p2', edited: true }),
    phoneme('w4a', 'w4', 'etc', 3200, 3400),
    phoneme('w4b', 'w4', 'AI', 3400, 3600),
    phoneme('w4c', 'w4', 'etc', 3600, 4000),
    mark('p3', { layer: 'phrase', label: 'all is calm', startMs: 6000, endMs: 7000 }),
    mark('q1', { voiceId: OTHER_VOICE, layer: 'phrase', label: 'alto', startMs: 0, endMs: 2000 }),
  ]
}

/** Returns the test song with the marks of `testMarks`. */
export function testContent(marks: Mark[] = testMarks()): SongContent {
  return {
    song: {
      id: 'song-1',
      name: 'Silent Night',
      durationMs: DURATION_MS,
      frameMs: FRAME_MS,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    voices: [
      { id: VOICE, songId: 'song-1', name: 'Lead', order: 0, color: '#e05d5d' },
      { id: OTHER_VOICE, songId: 'song-1', name: 'Backing', order: 1, color: '#5d5de0' },
    ],
    sections: [],
    marks,
  }
}
