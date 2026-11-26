import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent, Voice } from '../types.ts'
import { writeSplitRun } from './splitVoices.ts'

const RANGE = { startMs: 0, endMs: 10_000 }

function voice(id: string, name: string, order: number): Voice {
  return { id, songId: 's', name, order, color: '#ffb238' }
}

function phrase(id: string, voiceId: string, startMs: number, endMs: number): Mark {
  return { id, voiceId, layer: 'phrase', label: id, startMs, endMs, parentId: null, edited: false }
}

function word(id: string, phraseMark: Mark): Mark {
  return { ...phraseMark, id, layer: 'word', parentId: phraseMark.id }
}

function open(voices: Voice[], marks: Mark[] = []) {
  const content: SongContent = {
    song: {
      id: 's',
      name: 'carol',
      durationMs: 10_000,
      frameMs: 50,
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
    },
    voices,
    sections: [],
    marks,
  }
  useSongStore.setState({ current: content, history: { past: [], future: [] } })
}

const current = () => {
  const content = useSongStore.getState().current
  if (content === null) throw new Error('No song is open.')
  return content
}

const FEMALE_PHRASE = phrase('a', 'track-0', 1000, 6000)
const MALE_PHRASE = phrase('b', 'track-1', 4000, 8000)
const FEMALE_TRACK = { name: 'Female', marks: [FEMALE_PHRASE, word('a-word', FEMALE_PHRASE)] }
const TRACKS = [FEMALE_TRACK, { name: 'Male', marks: [MALE_PHRASE, word('b-word', MALE_PHRASE)] }]

beforeEach(() => {
  open([voice('v1', 'Lead Vocals', 0)], [phrase('old', 'v1', 0, 2000)])
})

afterEach(() => {
  useSongStore.setState({ current: null })
})

describe('writeSplitRun', () => {
  it('clears the range of the run voice and adds one voice with the marks of each track, as one undo step', () => {
    const ids = writeSplitRun('v1', RANGE, TRACKS, [])

    expect(current().voices.map((item) => item.name)).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(current().marks.map((mark) => [mark.id, mark.voiceId])).toEqual([
      ['a', ids?.[0]],
      ['a-word', ids?.[0]],
      ['b', ids?.[1]],
      ['b-word', ids?.[1]],
    ])
    expect(new Set(current().voices.map((item) => item.color)).size).toBe(3)
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('removes an emptied voice of the last run before it adds the new voices', () => {
    open([voice('v1', 'Lead Vocals', 0), voice('f', 'Female', 1)], [phrase('old', 'f', 0, 2000)])

    writeSplitRun('v1', RANGE, TRACKS, [{ voiceId: 'f', removable: true }])

    expect(current().voices.map((item) => item.name)).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(current().voices.some((item) => item.id === 'f')).toBe(false)
  })

  it('makes no voice for a track with no word and gives it the id null', () => {
    const ids = writeSplitRun('v1', RANGE, [FEMALE_TRACK, { name: 'Male', marks: [] }], [])

    expect(current().voices.map((item) => item.name)).toEqual(['Lead Vocals', 'Female'])
    expect(ids).toEqual([current().voices[1]?.id, null])
  })

  it('removes the voice of the run when the last run made it and the step empties it', () => {
    open([voice('v1', 'Lead Vocals', 0), voice('f', 'Female', 1)], [phrase('old', 'f', 0, 2000)])
    const before = current()

    writeSplitRun('f', RANGE, TRACKS, [{ voiceId: 'f', removable: true }])

    expect(current().voices.map((item) => item.name)).toEqual(['Lead Vocals', 'Female', 'Male'])
    expect(current().voices.some((item) => item.id === 'f')).toBe(false)
    useSongStore.getState().undo()
    expect(current()).toStrictEqual(before)
  })

  it('keeps the voice of the run that is not removable when the step empties it', () => {
    open([voice('v1', 'Lead Vocals', 0)], [phrase('old', 'v1', 0, 2000)])

    writeSplitRun('v1', RANGE, TRACKS, [])

    expect(current().voices.map((item) => item.id)).toContain('v1')
  })

  it('changes nothing and returns null when the song has no room for two voices', () => {
    const voices = Array.from({ length: MAX_VOICES - 1 }, (_, index) =>
      voice(`v${index + 1}`, index === 0 ? 'Lead Vocals' : `Voice ${index + 1}`, index),
    )
    open(voices)

    expect(writeSplitRun('v1', RANGE, TRACKS, [])).toBeNull()
    expect(current().voices).toHaveLength(MAX_VOICES - 1)
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('changes nothing and returns null when the voice of the run does not exist', () => {
    expect(writeSplitRun('gone', RANGE, TRACKS, [])).toBeNull()
    expect(current().marks.map((mark) => mark.id)).toEqual(['old'])
  })
})
