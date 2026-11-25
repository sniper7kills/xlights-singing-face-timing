import { describe, expect, it } from 'vitest'
import type { Mark, SongContent, Voice } from '../../store/types.ts'
import { buildTracks } from '../xtiming/buildTracks.ts'
import { exportFiles } from '../xtiming/exportFiles.ts'
import type { ExportOptions } from '../xtiming/types.ts'
import { lyricsText } from './lyricsText.ts'
import { songArchiveEntries, songArchiveName, type SongArchiveInput } from './songArchive.ts'
import { songJson } from './songJson.ts'

const MODIFIED = new Date(2026, 10, 24, 12, 0, 0)
const decoder = new TextDecoder()

function voice(id: string, name: string, order: number): Voice {
  return { id, songId: 'song-1', name, order, color: '#ffb238', previewMuted: true }
}

function phrase(voiceId: string, label: string, startMs: number): Mark {
  return {
    id: `${voiceId}-${startMs}`,
    voiceId,
    layer: 'phrase',
    label,
    startMs,
    endMs: startMs + 500,
    parentId: null,
    edited: false,
  }
}

const lead = voice('v1', 'Lead Vocals', 0)
const choir = voice('v2', 'Choir', 1)

function content(name = 'Carol'): SongContent {
  return {
    song: {
      id: 'song-1',
      name,
      durationMs: 60_000,
      frameMs: 50,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
    },
    // The store order is not the voice order, so the lyrics must sort.
    voices: [choir, lead],
    sections: [{ id: 's1', songId: 'song-1', name: 'Verse', startMs: 0, endMs: 5000 }],
    marks: [
      phrase('v1', 'Holy night', 2000),
      phrase('v1', 'Silent night', 1000),
      phrase('v2', 'All is calm', 3000),
      {
        ...phrase('v1', 'Silent', 1000),
        id: 'w1',
        layer: 'word',
        parentId: 'v1-1000',
        unknown: true,
      },
    ],
  }
}

function input(overrides: Partial<SongArchiveInput> = {}): SongArchiveInput {
  const song = content()
  const options: ExportOptions = {
    voiceIds: ['v1', 'v2'],
    grouping: 'voice',
    packaging: 'one-file',
    writeRest: false,
    trackNames: {},
  }
  return {
    content: song,
    tracks: buildTracks(song.song, song.voices, song.sections, song.marks, options),
    packaging: 'one-file',
    audio: { fileName: 'carol.ogg', data: new Uint8Array([1, 2, 3]) },
    customEntries: [],
    extraFiles: [],
    modified: MODIFIED,
    ...overrides,
  }
}

function names(archive: SongArchiveInput): string[] {
  return songArchiveEntries(archive).map((entry) => entry.name)
}

function text(archive: SongArchiveInput, name: string): string {
  const found = songArchiveEntries(archive).find((entry) => entry.name === name)
  if (!found) throw new Error(`No entry ${name}`)
  return decoder.decode(found.data)
}

describe('songArchiveName', () => {
  it('gives <song name>.zip with the unsafe characters replaced', () => {
    expect(songArchiveName('AC/DC: Noël')).toBe('AC_DC_ Noël.zip')
  })
})

describe('songArchiveEntries', () => {
  it('lists the timing file, the audio, song.json, lyrics.txt and README.txt with one file', () => {
    expect(names(input())).toEqual([
      'timing/Carol.xtiming',
      'audio/carol.ogg',
      'song.json',
      'lyrics.txt',
      'README.txt',
    ])
  })

  it('holds the same text as exportFiles for each timing file', () => {
    const archive = input({ packaging: 'file-per-track' })
    const files = exportFiles(archive.tracks, 'Carol', 'file-per-track')

    for (const file of files) expect(text(archive, `timing/${file.name}`)).toBe(file.text)
  })

  it('adds the file with all timing tracks when the packaging gives one file for each timing track', () => {
    const archive = input({ packaging: 'file-per-track' })
    const [all] = exportFiles(archive.tracks, 'Carol', 'one-file')

    expect(names(archive).slice(0, 3)).toEqual([
      'timing/Carol - Lead Vocals.xtiming',
      'timing/Carol - Choir.xtiming',
      'timing/Carol - all.xtiming',
    ])
    expect(text(archive, 'timing/Carol - all.xtiming')).toBe(all?.text)
  })

  it('holds the audio bytes without a copy', () => {
    const archive = input()

    expect(songArchiveEntries(archive)[1]?.data).toBe(archive.audio.data)
  })

  it('gives a legal entry name for an audio file name with "/" and non-ASCII characters', () => {
    const archive = input({ audio: { fileName: '../Noël/雪.ogg', data: new Uint8Array(0) } })

    expect(names(archive)[1]).toBe('audio/_._Noël_雪.ogg')
  })

  it('adds custom-dictionary.txt in the format of its export when the dictionary has an entry', () => {
    const archive = input({ customEntries: [{ word: 'NOEL', symbols: 'N OW0 EH1 L' }] })

    expect(text(archive, 'custom-dictionary.txt')).toBe(
      ';;; Custom dictionary of Singing Face Timing: the word, two spaces, then the CMU symbols.\nNOEL  N OW0 EH1 L\n',
    )
  })

  it('omits lyrics.txt when no voice has a phrase', () => {
    const song = { ...content(), marks: [] }

    expect(names(input({ content: song, tracks: [] }))).toEqual([
      'audio/carol.ogg',
      'song.json',
      'README.txt',
    ])
  })

  it('puts the extra files of the caller before README.txt and lists them in README.txt', () => {
    const archive = input({
      extraFiles: [
        {
          folder: 'tracks',
          fileName: 'vocals.wav',
          description: 'The vocals.',
          data: new Uint8Array(0),
        },
      ],
    })

    expect(names(archive).slice(-2)).toEqual(['tracks/vocals.wav', 'README.txt'])
    expect(text(archive, 'README.txt')).toContain('- tracks/vocals.wav: The vocals.')
  })

  it('gives each entry a unique name', () => {
    const archive = input({ audio: { fileName: 'song.json', data: new Uint8Array(0) } })
    const extra = {
      folder: null,
      fileName: 'README.txt',
      description: 'x',
      data: new Uint8Array(0),
    }

    expect(names({ ...archive, extraFiles: [extra] })).toEqual([
      'timing/Carol.xtiming',
      'audio/song.json',
      'song.json',
      'lyrics.txt',
      'README.txt',
      'README (2).txt',
    ])
  })

  it('writes README.txt with one line for each entry and the import steps', () => {
    const readme = text(input(), 'README.txt')

    expect(
      readme.startsWith(
        [
          'Singing Face Timing: Carol',
          '',
          'This zip file holds these files:',
          '- timing/Carol.xtiming: A timing file for xLights.',
          '- audio/carol.ogg: The audio file of the song, with its original bytes.',
          '- song.json: The song, the voices, the sections and the marks, for backup and for other programs. The app does not import this file.',
          '- lyrics.txt: The phrases of each voice as text.',
          '- README.txt: This file: the list of the files and the xLights import steps.',
          '',
          'To import a timing file into xLights, do these steps. The export dialog of the app shows the same steps.',
          '1. Open the sequence in xLights. Use the same audio file, so the times match.',
        ].join('\n'),
      ),
    ).toBe(true)
    expect(readme.endsWith('7. Repeat steps 5 and 6 for each face model.\n')).toBe(true)
  })

  it('gives each entry the date of the input', () => {
    expect(songArchiveEntries(input()).every((entry) => entry.modified === MODIFIED)).toBe(true)
  })
})

describe('lyricsText', () => {
  it('gives each voice in order as a heading with its phrases in time order', () => {
    const song = content()

    expect(lyricsText(song.voices, song.marks)).toBe(
      'Lead Vocals\nSilent night\nHoly night\n\nChoir\nAll is calm\n',
    )
  })

  it('gives an empty text when no voice has a phrase', () => {
    expect(lyricsText([lead], [])).toBe('')
  })
})

describe('songJson', () => {
  it('writes format version 1 with the song, voices, sections and marks in a fixed key order', () => {
    const value: unknown = JSON.parse(songJson(content()))

    expect(value).toEqual({
      format: 'singing-face-timing-song',
      version: 1,
      song: content().song,
      voices: [
        { id: 'v2', songId: 'song-1', name: 'Choir', order: 1, color: '#ffb238' },
        { id: 'v1', songId: 'song-1', name: 'Lead Vocals', order: 0, color: '#ffb238' },
      ],
      sections: content().sections,
      marks: content().marks,
    })
    expect(Object.keys(value as object)).toEqual([
      'format',
      'version',
      'song',
      'voices',
      'sections',
      'marks',
    ])
  })

  it('omits previewMuted, which is view state', () => {
    expect(songJson(content())).not.toContain('previewMuted')
  })

  it('gives the same text for marks with the keys in another order', () => {
    const song = content()
    const reordered = song.marks.map((mark) => {
      const { label, ...rest } = mark
      return { label, ...rest }
    })

    expect(songJson({ ...song, marks: reordered })).toBe(songJson(song))
  })

  it('ends with a line end', () => {
    expect(songJson(content()).endsWith('}\n')).toBe(true)
  })
})
