import { beforeEach, describe, expect, it } from 'vitest'
import { mark, OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import type { SingerRange } from '../../lib/singers/assignSingers.ts'
import { MAX_VOICES, VOICE_COLORS } from '../../lib/voices/voiceRules.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { find, marksOf, openTestSong, steps } from './actions.test-helpers.ts'
import { violations } from './invariant.test-helpers.ts'
import { putSingersOnVoices } from './singerVoices.ts'
import { addVoice } from './voices.ts'

function current(): SongContent {
  const content = useSongStore.getState().current
  if (content === null) throw new Error('No song is open.')
  return content
}

function voiceNamed(name: string) {
  const voice = current().voices.find((item) => item.name === name)
  if (voice === undefined) throw new Error(`No voice has the name ${name}.`)
  return voice
}

function marksOn(voiceId: string, layer?: Mark['layer']): Mark[] {
  return marksOf().filter(
    (mark) => mark.voiceId === voiceId && (layer === undefined || mark.layer === layer),
  )
}

/** Returns singer ranges in which each listed singer sings the whole phrase, so each phrase gets those singers. */
function sungOver(singers: Record<string, number[]>): SingerRange[] {
  return Object.entries(singers).flatMap(([id, list]) => {
    const phrase = find(id)
    if (phrase === undefined) return []
    return list.map((singer) => ({ singer, startMs: phrase.startMs, endMs: phrase.endMs }))
  })
}

/** Runs the singer step on the phrases of the list, each with the singers of the list. */
function putOnVoices(singers: Record<string, number[]>, voiceId = VOICE, maxSingers = MAX_VOICES) {
  return putSingersOnVoices(voiceId, Object.keys(singers), sungOver(singers), maxSingers)
}

/**
 * The marks of a phrase in which singer 0 sings "baby its" and singer 1 answers "cold outside".
 * Each word is 1 s long and has one phoneme.
 */
function lineMarks(): Mark[] {
  const labels = ['baby', 'its', 'cold', 'outside']
  return [
    mark('line', { layer: 'phrase', label: 'baby its cold outside', startMs: 0, endMs: 4000 }),
    ...labels.flatMap((label, index) => [
      mark(label, { label, startMs: index * 1000, endMs: index * 1000 + 1000, parentId: 'line' }),
      mark(`${label}-ph`, {
        layer: 'phoneme',
        label: 'etc',
        startMs: index * 1000,
        endMs: index * 1000 + 1000,
        parentId: label,
      }),
    ]),
  ]
}

const LINE_SEGMENTS: SingerRange[] = [
  { singer: 0, startMs: 0, endMs: 2000 },
  { singer: 1, startMs: 2000, endMs: 4000 },
]

beforeEach(() => openTestSong())

describe('putSingersOnVoices', () => {
  it('adds "Singer 2" with the next colour and moves the phrases of singer 1 to it, as one undo step', () => {
    const result = putOnVoices({ p1: [0], p2: [1] })

    const singer = voiceNamed('Singer 2')
    expect(result).toEqual({
      voiceCount: 2,
      dividedCount: 0,
      stats: { singersWithPhrases: 2, phrasesWithNoSinger: 0, phrasesWithMoreSingers: 0 },
    })
    expect(singer).toMatchObject({ order: 2, color: VOICE_COLORS[0] })
    expect(find('p2')?.voiceId).toBe(singer.id)
    expect(find('w4')).toMatchObject({ voiceId: singer.id, parentId: 'p2' })
    expect(find('w4a')).toMatchObject({ voiceId: singer.id, parentId: 'w4' })
    expect(find('p1')?.voiceId).toBe(VOICE)
    expect(steps()).toBe(1)
    expect(violations(current())).toEqual([])
  })

  it('copies a phrase of two singers to the second voice with new ids and keeps it on the first', () => {
    putOnVoices({ p2: [0, 1] })

    const singer = voiceNamed('Singer 2')
    const copies = marksOn(singer.id)
    expect(find('p2')?.voiceId).toBe(VOICE)
    expect(copies).toHaveLength(5)
    expect(copies.map((mark) => mark.id)).not.toContain('p2')
    const phrase = copies.find((mark) => mark.layer === 'phrase')
    const word = copies.find((mark) => mark.layer === 'word')
    expect(word?.parentId).toBe(phrase?.id)
    expect(copies.filter((mark) => mark.parentId === word?.id)).toHaveLength(3)
    expect(violations(current())).toEqual([])
  })

  it('moves a phrase to its first singer and copies it to the next one', () => {
    putOnVoices({ p1: [0], p2: [1, 2] })

    const second = voiceNamed('Singer 2')
    const third = voiceNamed('Singer 3')
    expect(find('p2')?.voiceId).toBe(second.id)
    expect(marksOn(third.id, 'phrase').map((mark) => mark.label)).toEqual(['night'])
    expect(third.color).toBe(VOICE_COLORS[1])
    expect(violations(current())).toEqual([])
  })

  it('changes only the phrases that the run wrote', () => {
    putSingersOnVoices(
      VOICE,
      ['p1', 'p2'],
      [...sungOver({ p1: [0], p2: [1] }), { singer: 1, startMs: 0, endMs: 10_000 }],
      MAX_VOICES,
    )

    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 2').id)
    expect(find('p3')?.voiceId).toBe(VOICE)
    expect(find('q1')?.voiceId).toBe(OTHER_VOICE)
  })

  it('takes the lowest free number for the name of a new voice', () => {
    addVoice('song-1', 'Singer 2')

    putOnVoices({ p1: [0], p2: [1] })

    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 3').id)
  })

  it('restores the song exactly with one undo', () => {
    putOnVoices({ p1: [0, 1], p2: [1], p3: [2] })

    useSongStore.getState().undo()

    expect(current()).toEqual(testContent())
  })

  it('numbers the singers by their first phrase, so a gap in the numbers makes no empty voice', () => {
    const result = putOnVoices({ p1: [0], p2: [5] })

    expect(result.voiceCount).toBe(2)
    expect(current().voices).toHaveLength(testContent().voices.length + 1)
    for (const voice of current().voices) expect(marksOn(voice.id, 'phrase')).not.toHaveLength(0)
    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 2').id)
    expect(steps()).toBe(1)
  })

  it('records no step for one singer, an unknown voice or no phrase of the run', () => {
    putOnVoices({ p1: [0] })
    putOnVoices({ p1: [0], p2: [1] }, 'gone')
    expect(putOnVoices({ q1: [1] }).voiceCount).toBe(1)

    expect(steps()).toBe(0)
  })

  it('keeps a singer with no free voice on the voice of the run at 12 voices', () => {
    while (current().voices.length < MAX_VOICES - 1) addVoice('song-1')
    const before = steps()

    const result = putOnVoices({ p1: [0], p2: [1], p3: [2] })

    expect(result.voiceCount).toBe(2)
    expect(current().voices).toHaveLength(MAX_VOICES)
    expect(find('p2')?.voiceId).toBe(voiceNamed('Singer 2').id)
    expect(find('p3')?.voiceId).toBe(VOICE)
    expect(steps()).toBe(before + 1)
  })

  it('gives each phrase to its singers only with the most singers that the song has room for', () => {
    const result = putOnVoices({ p1: [0], p2: [1], p3: [2] }, VOICE, 2)

    expect(result.voiceCount).toBe(2)
    expect(result.stats.singersWithPhrases).toBe(3)
    expect(find('p3')?.voiceId).toBe(voiceNamed('Singer 2').id)
  })
})

describe('putSingersOnVoices with a change of singer inside a phrase', () => {
  beforeEach(() => {
    useSongStore.setState({ current: testContent(lineMarks()), history: emptyHistory() })
  })

  it('divides the phrase where the singer changes and puts each part on the voice of its singer', () => {
    const before = current().marks

    const result = putSingersOnVoices(VOICE, ['line'], LINE_SEGMENTS, MAX_VOICES)

    expect(result).toMatchObject({ voiceCount: 2, dividedCount: 1 })
    expect(result.stats.phrasesWithMoreSingers).toBe(0)
    const singer = voiceNamed('Singer 2')
    expect(find('line')).toMatchObject({
      voiceId: VOICE,
      startMs: 0,
      endMs: 2000,
      label: 'baby its',
    })
    expect(marksOn(singer.id, 'phrase')).toEqual([
      expect.objectContaining({ startMs: 2000, endMs: 4000, label: 'cold outside' }),
    ])
    expect(find('cold')).toMatchObject({ voiceId: singer.id, startMs: 2000, endMs: 3000 })
    expect(find('outside-ph')).toMatchObject({ voiceId: singer.id, startMs: 3000, endMs: 4000 })
    for (const mark of before.filter((item) => item.layer !== 'phrase'))
      expect(find(mark.id)).toMatchObject({ startMs: mark.startMs, endMs: mark.endMs })
    expect(violations(current())).toEqual([])
    expect(steps()).toBe(1)
  })

  it('removes the division, the move and the new voice with one undo', () => {
    putSingersOnVoices(VOICE, ['line'], LINE_SEGMENTS, MAX_VOICES)

    useSongStore.getState().undo()

    expect(current()).toEqual(testContent(lineMarks()))
  })

  it('divides no phrase when the song has room for one singer only', () => {
    const result = putSingersOnVoices(VOICE, ['line'], LINE_SEGMENTS, 1)

    expect(result).toMatchObject({ voiceCount: 1, dividedCount: 0 })
    // The counts describe the phrase as it stays: one phrase that both singers sing.
    expect(result.stats).toEqual({
      singersWithPhrases: 2,
      phrasesWithNoSinger: 0,
      phrasesWithMoreSingers: 1,
    })
    expect(current()).toEqual(testContent(lineMarks()))
    expect(steps()).toBe(0)
  })
})
