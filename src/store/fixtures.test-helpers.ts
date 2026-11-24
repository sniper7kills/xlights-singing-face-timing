import type { Mark, Section, SongContent, Voice } from './types.ts'

/** Returns a song with one voice, one section and a phrase with one word, for tests. */
export function makeSongContent(songId = 'song-1'): SongContent {
  const voice: Voice = {
    id: `${songId}-voice`,
    songId,
    name: 'Lead Vocals',
    order: 0,
    color: '#e05d5d',
  }
  const section: Section = {
    id: `${songId}-section`,
    songId,
    name: 'Chorus 1',
    startMs: 0,
    endMs: 4000,
  }
  const phrase: Mark = {
    id: `${songId}-phrase`,
    voiceId: voice.id,
    layer: 'phrase',
    label: 'silent night',
    startMs: 0,
    endMs: 2000,
    parentId: null,
    edited: false,
  }
  const word: Mark = {
    ...phrase,
    id: `${songId}-word`,
    layer: 'word',
    label: 'silent',
    endMs: 1000,
    parentId: phrase.id,
  }
  return {
    song: {
      id: songId,
      name: 'Silent Night',
      durationMs: 28900,
      frameMs: 50,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    voices: [voice],
    sections: [section],
    marks: [phrase, word],
  }
}
