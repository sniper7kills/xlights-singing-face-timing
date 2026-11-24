import type { ExportOptions } from '../../lib/xtiming/types.ts'
import type { Mark, Section, SongContent, Voice } from '../../store/types.ts'

/** Returns a voice of the song `song-1`, for tests. */
export function makeVoice(id: string, name: string, order: number): Voice {
  return { id, songId: 'song-1', name, order, color: '#ffb238' }
}

/** Returns a section of the song `song-1`, for tests. */
export function makeSection(id: string, name: string, startMs: number, endMs: number): Section {
  return { id, songId: 'song-1', name, startMs, endMs }
}

/**
 * Returns a phrase with one word and one phoneme for the voice, for tests.
 * @param voiceId The id of the voice.
 * @param startMs The start of the phrase. The phrase is 1000 ms long.
 */
export function makeSungPhrase(voiceId: string, startMs: number): Mark[] {
  const base = { voiceId, startMs, endMs: startMs + 1000, edited: false }
  const phrase: Mark = {
    ...base,
    id: `${voiceId}-${startMs}-phrase`,
    layer: 'phrase',
    label: 'Noel',
    parentId: null,
  }
  const word: Mark = {
    ...base,
    id: `${voiceId}-${startMs}-word`,
    layer: 'word',
    label: 'Noel',
    parentId: phrase.id,
  }
  const phoneme: Mark = {
    ...base,
    id: `${voiceId}-${startMs}-phoneme`,
    layer: 'phoneme',
    label: 'O',
    parentId: word.id,
  }
  return [phrase, word, phoneme]
}

/** Returns a 50 ms song named "Carol" with the voices, sections and marks, for tests. */
export function makeContent(voices: Voice[], marks: Mark[], sections: Section[] = []): SongContent {
  return {
    song: {
      id: 'song-1',
      name: 'Carol',
      durationMs: 60000,
      frameMs: 50,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    voices,
    sections,
    marks,
  }
}

/** Returns the export options of a first export of the content, for tests. */
export function makeOptions(content: SongContent): ExportOptions {
  return {
    voiceIds: content.voices.map((voice) => voice.id),
    grouping: 'voice',
    packaging: 'one-file',
    writeRest: false,
    trackNames: {},
  }
}
