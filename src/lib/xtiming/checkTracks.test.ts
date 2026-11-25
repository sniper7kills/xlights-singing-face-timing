import { describe, expect, it } from 'vitest'
import type { Layer, Mark, Song, Voice } from '../../store/types.ts'
import { buildTracks } from './buildTracks.ts'
import { checkTracks } from './checkTracks.ts'
import type { ExportMark, ExportOptions, ExportTrack } from './types.ts'

const song: Song = {
  id: 'song-1',
  name: 'Carol',
  durationMs: 60000,
  frameMs: 50,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
}

const voices: Voice[] = [
  { id: 'lead', songId: 'song-1', name: 'Lead Vocals', order: 0, color: '#e05d5d' },
  { id: 'harmony', songId: 'song-1', name: 'Harmony', order: 1, color: '#5d8de0' },
]

function makeMark(
  id: string,
  layer: Layer,
  label: string,
  startMs: number,
  endMs: number,
  parentId: string | null = null,
  voiceId = 'lead',
): Mark {
  return { id, voiceId, layer, label, startMs, endMs, parentId, edited: false }
}

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    voiceIds: ['lead'],
    grouping: 'voice',
    packaging: 'one-file',
    writeRest: false,
    trackNames: {},
    ...overrides,
  }
}

/** One phrase with the words "Jingle" and "bells", each with two phonemes. Every check passes. */
function cleanMarks(): Mark[] {
  return [
    makeMark('p1', 'phrase', 'Jingle bells', 12350, 13900),
    makeMark('w1', 'word', 'Jingle', 12350, 13000, 'p1'),
    makeMark('w2', 'word', 'bells', 13000, 13900, 'p1'),
    makeMark('ph1', 'phoneme', 'etc', 12350, 12450, 'w1'),
    makeMark('ph2', 'phoneme', 'AI', 12450, 13000, 'w1'),
    makeMark('ph3', 'phoneme', 'MBP', 13000, 13100, 'w2'),
    makeMark('ph4', 'phoneme', 'E', 13100, 13900, 'w2'),
  ]
}

function exportMark(source: Mark, extra: Partial<ExportMark> = {}): ExportMark {
  const mark: ExportMark = {
    label: source.label,
    startMs: source.startMs,
    endMs: source.endMs,
    markId: source.id,
  }
  if (source.layer === 'word') {
    mark.unknown = false
    mark.estimated = false
  }
  return { ...mark, ...extra }
}

/** Builds one timing track from the marks by hand, so a test can give a bad output. */
function trackOf(marks: Mark[], name = 'Lead Vocals', voiceId = 'lead'): ExportTrack {
  const layer = (kind: Layer) =>
    marks.filter((mark) => mark.layer === kind).map((m) => exportMark(m))
  return { name, key: voiceId, voiceId, layers: [layer('phrase'), layer('word'), layer('phoneme')] }
}

function check(tracks: ExportTrack[], marks: Mark[], opts: ExportOptions = options()) {
  return checkTracks(tracks, song, voices, marks, opts)
}

describe('checkTracks', () => {
  it('gives no finding for a clean song', () => {
    const marks = cleanMarks()
    expect(check(buildTracks(song, voices, [], marks, options()), marks)).toEqual([])
  })

  describe('a selected voice has no marks', () => {
    it('gives an error for a timing track with three empty layers in grouping voice', () => {
      const marks = cleanMarks()
      const opts = options({ voiceIds: ['lead', 'harmony'] })
      const findings = check(buildTracks(song, voices, [], marks, opts), marks, opts)

      expect(findings).toEqual([
        {
          type: 'error',
          check: 'voice-no-marks',
          message: '“Harmony” has no marks.',
          voiceId: 'harmony',
        },
      ])
    })

    it('gives an error for a voice that grouping voice-section omits', () => {
      const marks = cleanMarks()
      const opts = options({ voiceIds: ['lead', 'harmony'], grouping: 'voice-section' })
      const tracks = buildTracks(song, voices, [], marks, opts)

      expect(tracks.map((track) => track.voiceId)).toEqual(['lead'])
      expect(check(tracks, marks, opts).map((f) => [f.type, f.check, f.voiceId])).toEqual([
        ['error', 'voice-no-marks', 'harmony'],
      ])
    })

    it('gives no error for a voice that is not selected', () => {
      const marks = cleanMarks()
      expect(check([trackOf(marks)], marks, options({ voiceIds: ['lead'] }))).toEqual([])
    })
  })

  describe('timing track names', () => {
    it('gives an error for two timing tracks with the same name', () => {
      const lead = cleanMarks()
      const harmony = cleanMarks().map((mark) => ({
        ...mark,
        id: `h-${mark.id}`,
        voiceId: 'harmony',
      }))
      for (const mark of harmony) if (mark.parentId !== null) mark.parentId = `h-${mark.parentId}`
      const marks = [...lead, ...harmony]
      const opts = options({
        voiceIds: ['lead', 'harmony'],
        trackNames: { harmony: 'Lead Vocals' },
      })

      expect(check(buildTracks(song, voices, [], marks, opts), marks, opts)).toEqual([
        {
          type: 'error',
          check: 'duplicate-name',
          message: 'Two timing tracks have the name “Lead Vocals”.',
          voiceId: 'harmony',
        },
      ])
    })

    it('gives an error for two default voice-section names that are the same because both names hold " - "', () => {
      const named: Voice[] = [
        { id: 'lead', songId: 'song-1', name: 'A', order: 0, color: '#e05d5d' },
        { id: 'harmony', songId: 'song-1', name: 'A - B', order: 1, color: '#5d8de0' },
      ]
      const sections = [
        { id: 's1', songId: 'song-1', name: 'B - Unsectioned', startMs: 10_000, endMs: 20_000 },
      ]
      const harmony = cleanMarks().map((mark) => ({
        ...mark,
        id: `h-${mark.id}`,
        voiceId: 'harmony',
        parentId: mark.parentId === null ? null : `h-${mark.parentId}`,
        startMs: mark.startMs + 20_000,
        endMs: mark.endMs + 20_000,
      }))
      const marks = [...cleanMarks(), ...harmony]
      const opts = options({ voiceIds: ['lead', 'harmony'], grouping: 'voice-section' })

      const tracks = buildTracks(song, named, sections, marks, opts)

      expect(tracks.map((track) => track.name)).toEqual([
        'A - B - Unsectioned',
        'A - B - Unsectioned',
      ])
      expect(checkTracks(tracks, song, named, marks, opts)).toEqual([
        {
          type: 'error',
          check: 'duplicate-name',
          message: 'Two timing tracks have the name “A - B - Unsectioned”.',
          voiceId: 'harmony',
        },
      ])
    })

    it('gives an error for an empty timing track name', () => {
      const marks = cleanMarks()
      const opts = options({ trackNames: { lead: '' } })

      expect(check(buildTracks(song, voices, [], marks, opts), marks, opts)).toEqual([
        {
          type: 'error',
          check: 'empty-name',
          message: 'A timing track of “Lead Vocals” has no name.',
          voiceId: 'lead',
        },
      ])
    })

    it('gives two empty-name errors and no duplicate-name error for two names with only spaces', () => {
      const marks = cleanMarks()
      const tracks = [trackOf(marks, ' '), trackOf(marks, ' ')]

      expect(check(tracks, marks).map((f) => f.check)).toEqual(['empty-name', 'empty-name'])
    })
  })

  describe('timing track names after the xLights import', () => {
    it('gives one warning for the timing track name Café', () => {
      const marks = cleanMarks()

      expect(check([trackOf(marks, 'Café')], marks)).toEqual([
        {
          type: 'warning',
          check: 'import-name-changed',
          message:
            'xLights shows the timing track “Café” as “Caf”. xLights removes = < > & " \' and characters that are not ASCII from a name.',
          voiceId: 'lead',
        },
      ])
    })

    it('gives no finding for the timing track name Lead Vocals', () => {
      const marks = cleanMarks()

      expect(check([trackOf(marks, 'Lead Vocals')], marks)).toEqual([])
    })

    it('gives a warning for two names that are the same after the import', () => {
      const marks = cleanMarks()
      const tracks = [trackOf(marks, 'Chœur'), trackOf(marks, 'Chüur', 'harmony')]

      expect(check(tracks, marks)).toEqual([
        expect.objectContaining({ check: 'import-name-changed', voiceId: 'lead' }),
        expect.objectContaining({ check: 'import-name-changed', voiceId: 'harmony' }),
        {
          type: 'warning',
          check: 'import-name-same',
          message:
            'xLights gives these timing tracks almost the same name: “Chur” and “Chur_1”. Change a voice name or a section name.',
          voiceId: 'harmony',
        },
      ])
    })

    it('gives a warning for a changed name that is the same as an earlier name that does not change', () => {
      const marks = cleanMarks()
      const tracks = [trackOf(marks, 'Caf'), trackOf(marks, 'Café', 'harmony')]

      expect(check(tracks, marks).map((f) => f.check)).toEqual([
        'import-name-changed',
        'import-name-same',
      ])
    })

    it('gives only the duplicate-name error for two names that are the same before the import', () => {
      const marks = cleanMarks()
      const tracks = [trackOf(marks, 'Café'), trackOf(marks, 'Café', 'harmony')]

      expect(check(tracks, marks).map((f) => f.check)).toEqual([
        'duplicate-name',
        'import-name-changed',
        'import-name-changed',
      ])
    })

    it('gives an error for a name that is empty after the import', () => {
      const marks = cleanMarks()

      expect(check([trackOf(marks, 'Ééé ')], marks)).toEqual([
        {
          type: 'error',
          check: 'import-name-empty',
          message:
            'xLights cannot use the timing track name “Ééé ”. Use letters from A to Z, digits or spaces.',
          voiceId: 'lead',
        },
      ])
    })

    it('gives a warning for a default voice-section name with an accented section name', () => {
      const sections = [
        { id: 's1', songId: 'song-1', name: 'Refrán', startMs: 10_000, endMs: 20_000 },
      ]
      const marks = cleanMarks()
      const opts = options({ grouping: 'voice-section' })

      const tracks = buildTracks(song, voices, sections, marks, opts)

      expect(check(tracks, marks, opts)).toEqual([
        expect.objectContaining({
          type: 'warning',
          check: 'import-name-changed',
          message: expect.stringContaining(
            '“Lead Vocals - Refrán” as “Lead Vocals - Refrn”',
          ) as string,
        }),
      ])
    })
  })

  describe('phoneme labels', () => {
    it('gives an error for a phoneme label that is not one of the ten labels', () => {
      const marks = cleanMarks()
      marks[3] = { ...marks[3], label: 'ai' } as Mark

      expect(check([trackOf(marks)], marks)).toEqual([
        {
          type: 'error',
          check: 'bad-phoneme-label',
          message: '“ai” at 0:12.350 is not a phoneme label.',
          markId: 'ph1',
          voiceId: 'lead',
        },
      ])
    })

    it('accepts each of the ten phoneme labels and the rest phoneme that the export adds', () => {
      const labels = ['AI', 'E', 'etc', 'FV', 'L', 'MBP', 'O', 'rest', 'U', 'WQ']
      const marks = [
        makeMark('p1', 'phrase', 'la', 0, 1100),
        makeMark('w1', 'word', 'la', 0, 1000, 'p1'),
        ...labels.map((label, i) =>
          makeMark(`ph${i}`, 'phoneme', label, i * 100, i * 100 + 100, 'w1'),
        ),
      ]
      const opts = options({ writeRest: true })

      expect(check(buildTracks(song, voices, [], marks, opts), marks, opts)).toEqual([])
    })
  })

  describe('mark times', () => {
    it('gives an error for a stored mark that ends at its start', () => {
      const marks = cleanMarks()
      marks[1] = makeMark('w1', 'word', 'Jingle', 12350, 12350, 'p1')
      const findings = check(buildTracks(song, voices, [], marks, options()), marks)

      expect(findings).toEqual([
        {
          type: 'error',
          check: 'end-not-after-start',
          message: '“Jingle” at 0:12.350 ends at or before its start.',
          markId: 'w1',
          voiceId: 'lead',
        },
      ])
    })

    it('gives an error for an output mark that ends before its start', () => {
      const marks = cleanMarks()
      const track = trackOf(marks)
      track.layers[0][0] = { ...track.layers[0][0], endMs: 12000 } as ExportMark

      expect(check([track], marks).map((f) => [f.type, f.check, f.markId])).toEqual([
        ['error', 'end-not-after-start', 'p1'],
      ])
    })

    it('gives a warning for a mark that ends before the start of the song', () => {
      const marks = [...cleanMarks(), makeMark('p0', 'phrase', 'Oh', -300, -100)]
      const findings = check(buildTracks(song, voices, [], marks, options()), marks)

      expect(findings).toEqual([
        {
          type: 'warning',
          check: 'short-mark',
          message:
            '“Oh” at 0:00.000 is shorter than one frame. The export makes it one frame long.',
          markId: 'p0',
          voiceId: 'lead',
        },
      ])
    })

    it('gives a warning for a mark that the snap makes shorter than the frame size', () => {
      const marks = cleanMarks()
      marks[4] = makeMark('ph2', 'phoneme', 'AI', 12450, 12460, 'w1')
      marks.push(makeMark('ph5', 'phoneme', 'L', 12460, 13000, 'w1'))
      const findings = check(buildTracks(song, voices, [], marks, options()), marks)

      expect(findings).toEqual([
        {
          type: 'warning',
          check: 'short-mark',
          message:
            '“AI” at 0:12.450 is shorter than one frame. The export makes it one frame long.',
          markId: 'ph2',
          voiceId: 'lead',
        },
      ])
    })

    it('gives a warning for a mark that ends after the end of the song', () => {
      const marks = cleanMarks()
      marks[0] = makeMark('p1', 'phrase', 'Jingle bells', 12350, 60100)
      const findings = check(buildTracks(song, voices, [], marks, options()), marks)

      expect(findings).toEqual([
        {
          type: 'warning',
          check: 'ends-after-song',
          message: '“Jingle bells” at 0:12.350 ends after the end of the song.',
          markId: 'p1',
          voiceId: 'lead',
        },
      ])
    })
  })

  describe('words', () => {
    it('gives a warning for a word with no phoneme', () => {
      const marks = cleanMarks().filter((mark) => mark.parentId !== 'w2')

      expect(check(buildTracks(song, voices, [], marks, options()), marks)).toEqual([
        {
          type: 'warning',
          check: 'word-no-phoneme',
          message: '“bells” at 0:13.000 has no phoneme.',
          markId: 'w2',
          voiceId: 'lead',
        },
      ])
    })

    it('gives a warning for a word with no mark id', () => {
      const marks = cleanMarks()
      const track = trackOf(marks)
      track.layers[1][0] = { label: 'Jingle', startMs: 12350, endMs: 13000 }

      expect(check([track], marks).map((f) => f.check)).toEqual(['word-no-phoneme'])
    })

    it('gives a warning for an unknown word', () => {
      const marks: Mark[] = cleanMarks().map((mark) =>
        mark.id === 'w2' ? { ...mark, label: 'Rudolph', unknown: true } : mark,
      )

      expect(check(buildTracks(song, voices, [], marks, options()), marks)).toEqual([
        {
          type: 'warning',
          check: 'unknown-word',
          message: '“Rudolph” at 0:13.000 is an unknown word. Its phonemes are a guess.',
          markId: 'w2',
          voiceId: 'lead',
        },
      ])
    })

    it('gives a warning for an estimated word', () => {
      const marks: Mark[] = cleanMarks().map((mark) =>
        mark.id === 'w1' ? { ...mark, label: 'all', estimated: true } : mark,
      )

      expect(check(buildTracks(song, voices, [], marks, options()), marks)).toEqual([
        {
          type: 'warning',
          check: 'estimated-word',
          message: '“all” at 0:12.350 has an estimated time.',
          markId: 'w1',
          voiceId: 'lead',
        },
      ])
    })
  })

  it('lists the errors before the warnings', () => {
    const marks = cleanMarks().filter((mark) => mark.parentId !== 'w2')
    const opts = options({ trackNames: { lead: '' } })

    expect(
      check(buildTracks(song, voices, [], marks, opts), marks, opts).map((f) => f.type),
    ).toEqual(['error', 'warning'])
  })

  it('gives exactly three warnings for a song with an unknown word, an estimated word and a word with no phoneme', () => {
    const marks: Mark[] = [
      makeMark('p1', 'phrase', 'Rudolph the red', 17000, 19500),
      { ...makeMark('w1', 'word', 'Rudolph', 17000, 18000, 'p1'), unknown: true },
      { ...makeMark('w2', 'word', 'the', 18000, 18500, 'p1'), estimated: true },
      makeMark('w3', 'word', 'red', 18500, 19500, 'p1'),
      makeMark('ph1', 'phoneme', 'etc', 17000, 17500, 'w1'),
      makeMark('ph2', 'phoneme', 'U', 17500, 18000, 'w1'),
      makeMark('ph3', 'phoneme', 'etc', 18000, 18500, 'w2'),
    ]
    const tracks = buildTracks(song, voices, [], marks, options())

    expect(check(tracks, marks).map((f) => [f.type, f.check, f.markId])).toEqual([
      ['warning', 'unknown-word', 'w1'],
      ['warning', 'estimated-word', 'w2'],
      ['warning', 'word-no-phoneme', 'w3'],
    ])
  })
})
