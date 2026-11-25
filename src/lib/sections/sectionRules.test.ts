import { describe, expect, it } from 'vitest'
import type { Section } from '../../store/types.ts'
import { mark } from '../marks/fixtures.test-helpers.ts'
import {
  fitSection,
  nextSectionName,
  phraseInSection,
  phrasesOfSection,
  previewSectionEdge,
  sectionTrimNote,
  snapSections,
  uniqueSectionName,
} from './sectionRules.ts'

const DURATION_MS = 30_000

function section(id: string, startMs: number, endMs: number, name = id): Section {
  return { id, songId: 'song-1', name, startMs, endMs }
}

// Two sections with a gap of 3 seconds between them.
const SECTIONS = [section('a', 5000, 10_000), section('b', 13_000, 20_000)]

describe('phraseInSection', () => {
  it('puts a phrase that spans two sections in the section that holds its middle', () => {
    const phrase = { startMs: 9000, endMs: 13_000 }

    expect(phraseInSection(section('a', 5000, 10_000), phrase)).toBe(false)
    expect(phraseInSection(section('b', 10_000, 20_000), phrase)).toBe(true)
  })

  it('puts a middle at the section end in the next section', () => {
    const phrase = { startMs: 9000, endMs: 11_000 }

    expect(phraseInSection(section('a', 5000, 10_000), phrase)).toBe(false)
    expect(phraseInSection(section('b', 10_000, 12_000), phrase)).toBe(true)
  })
})

describe('phrasesOfSection', () => {
  it('returns the phrases of the section in time order and ignores words', () => {
    const marks = [
      mark('p2', { layer: 'phrase', startMs: 7000, endMs: 8000 }),
      mark('w', { startMs: 5000, endMs: 6000 }),
      mark('p1', { layer: 'phrase', startMs: 5000, endMs: 6000 }),
      mark('p3', { layer: 'phrase', startMs: 12_000, endMs: 13_000 }),
    ]

    expect(phrasesOfSection(section('a', 5000, 10_000), marks).map((m) => m.id)).toEqual([
      'p1',
      'p2',
    ])
  })
})

describe('fitSection', () => {
  it('keeps a free range and snaps it to the frame size', () => {
    expect(fitSection([], { startMs: 10_010, endMs: 25_030 }, 50, DURATION_MS)).toEqual({
      startMs: 10_000,
      endMs: 25_050,
    })
  })

  it('trims an overlap at the start', () => {
    expect(fitSection(SECTIONS, { startMs: 18_000, endMs: 25_000 }, 50, DURATION_MS)).toEqual({
      startMs: 20_000,
      endMs: 25_000,
    })
  })

  it('trims an overlap at the end', () => {
    expect(fitSection(SECTIONS, { startMs: 1000, endMs: 7000 }, 50, DURATION_MS)).toEqual({
      startMs: 1000,
      endMs: 5000,
    })
  })

  it('takes the longest free part of a range over a section', () => {
    expect(fitSection(SECTIONS, { startMs: 3000, endMs: 12_500 }, 50, DURATION_MS)).toEqual({
      startMs: 10_000,
      endMs: 12_500,
    })
  })

  it('takes the earliest of two free parts with the same length', () => {
    expect(
      fitSection([section('a', 5000, 10_000)], { startMs: 3000, endMs: 12_000 }, 50, DURATION_MS),
    ).toEqual({ startMs: 3000, endMs: 5000 })
  })

  it('returns null when the free part is shorter than 1 second', () => {
    expect(fitSection(SECTIONS, { startMs: 4200, endMs: 10_500 }, 50, DURATION_MS)).toBeNull()
    expect(fitSection(SECTIONS, { startMs: 6000, endMs: 9000 }, 50, DURATION_MS)).toBeNull()
  })

  it('keeps the range inside the song', () => {
    expect(fitSection([], { startMs: 28_000, endMs: 30_000 }, 50, 29_980)).toEqual({
      startMs: 28_000,
      endMs: 29_950,
    })
  })
})

describe('uniqueSectionName', () => {
  it('trims the name and keeps a free name', () => {
    expect(uniqueSectionName(SECTIONS, '  Chorus ')).toBe('Chorus')
  })

  it('gives "Chorus 2", then "Chorus 3" for a name that exists', () => {
    const one = [section('c', 0, 1000, 'Chorus')]
    const two = [...one, section('d', 2000, 3000, 'Chorus 2')]

    expect(uniqueSectionName(one, 'chorus')).toBe('chorus 2')
    expect(uniqueSectionName(two, 'Chorus')).toBe('Chorus 3')
  })

  it('ignores the name of the section that gets the name', () => {
    expect(uniqueSectionName([section('c', 0, 1000, 'Chorus')], 'CHORUS', 'c')).toBe('CHORUS')
  })

  it('keeps a numbered name inside 40 characters', () => {
    const long = 'x'.repeat(45)
    const taken = [section('c', 0, 1000, 'x'.repeat(40))]

    expect(uniqueSectionName([], long)).toBe('x'.repeat(40))
    expect(uniqueSectionName(taken, long)).toBe(`${'x'.repeat(38)} 2`)
  })

  it('returns an empty string for a name with only spaces', () => {
    expect(uniqueSectionName(SECTIONS, '   ')).toBe('')
  })
})

describe('nextSectionName', () => {
  it('gives the lowest free number from 1', () => {
    expect(nextSectionName([])).toBe('Section 1')
    expect(
      nextSectionName([section('a', 0, 1000, 'section 1'), section('b', 0, 1000, 'Section 3')]),
    ).toBe('Section 2')
  })
})

describe('previewSectionEdge', () => {
  it('stops the end at the start of the next section', () => {
    expect(previewSectionEdge(SECTIONS, 'a', 'end', 16_000, 50, DURATION_MS)).toEqual({
      startMs: 5000,
      endMs: 13_000,
    })
  })

  it('stops the start at the end of the section before it', () => {
    expect(previewSectionEdge(SECTIONS, 'b', 'start', 2000, 50, DURATION_MS)).toEqual({
      startMs: 10_000,
      endMs: 20_000,
    })
  })

  it('keeps the section 1 second long', () => {
    expect(previewSectionEdge(SECTIONS, 'a', 'end', 5200, 50, DURATION_MS)?.endMs).toBe(6000)
    expect(previewSectionEdge(SECTIONS, 'a', 'start', 9900, 50, DURATION_MS)?.startMs).toBe(9000)
  })

  it('stops at the song start and at the last frame of the song', () => {
    expect(previewSectionEdge(SECTIONS, 'a', 'start', -400, 50, DURATION_MS)?.startMs).toBe(0)
    expect(previewSectionEdge(SECTIONS, 'b', 'end', 40_000, 50, 29_980)?.endMs).toBe(29_950)
  })

  it('snaps to 25 ms and to 50 ms', () => {
    expect(previewSectionEdge(SECTIONS, 'a', 'end', 11_030, 25, DURATION_MS)?.endMs).toBe(11_025)
    expect(previewSectionEdge(SECTIONS, 'a', 'end', 11_030, 50, DURATION_MS)?.endMs).toBe(11_050)
  })

  it('keeps the range when no legal time exists', () => {
    const short = [section('s', 0, 500)]

    expect(previewSectionEdge(short, 's', 'start', 200, 50, DURATION_MS)).toEqual({
      startMs: 0,
      endMs: 500,
    })
  })

  it('returns null for an unknown id', () => {
    expect(previewSectionEdge(SECTIONS, 'x', 'end', 2000, 50, DURATION_MS)).toBeNull()
  })
})

describe('snapSections', () => {
  it('snaps each time and keeps 1 second and no overlap', () => {
    const sections = [section('a', 1025, 2025), section('b', 2025, 3100), section('c', 4000, 5000)]

    const snapped = snapSections(sections, 50, DURATION_MS)

    expect(snapped.map((s) => [s.startMs, s.endMs])).toEqual([
      [1050, 2050],
      [2050, 3100],
      [4000, 5000],
    ])
    for (const s of snapped) expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(1000)
    expect(snapped[2]).toBe(sections[2])
  })

  it('stops an end at the last frame of a song that is not a multiple of the frame size', () => {
    const snapped = snapSections([section('a', 8000, 10_025)], 50, 10_040)

    expect(snapped.map((s) => [s.startMs, s.endMs])).toEqual([[8000, 10_000]])
  })

  it('moves the start earlier when the stop at the song end leaves less than 1 second', () => {
    const snapped = snapSections([section('a', 9025, 10_025)], 50, 10_040)

    expect(snapped.map((s) => [s.startMs, s.endMs])).toEqual([[9000, 10_000]])
  })

  it('keeps two sections that touch near the song end inside the song with no overlap', () => {
    const sections = [section('a', 8000, 9025), section('b', 9025, 10_025)]

    const snapped = snapSections(sections, 50, 10_040)

    expect(snapped.map((s) => [s.id, s.startMs, s.endMs])).toEqual([
      ['a', 8000, 9000],
      ['b', 9000, 10_000],
    ])
  })

  it('removes a section that cannot stay 1 second long in the song', () => {
    const sections = [section('a', 0, 1000), section('b', 1000, 2025)]

    const snapped = snapSections(sections, 50, 1040)

    expect(snapped.map((s) => [s.id, s.startMs, s.endMs])).toEqual([['b', 0, 1000]])
  })
})

describe('sectionTrimNote', () => {
  const verse = [section('v', 0, 16_000, 'Verse 1'), section('c', 23_000, 28_000, 'Chorus')]

  it('names the section before a new section that starts later than the selection', () => {
    expect(
      sectionTrimNote(
        verse,
        { startMs: 14_000, endMs: 23_000 },
        { startMs: 16_000, endMs: 23_000 },
        50,
      ),
    ).toBe('The section starts at 0:16.000, after "Verse 1".')
  })

  it('names the section after a new section that ends earlier than the selection', () => {
    expect(
      sectionTrimNote(
        verse,
        { startMs: 17_000, endMs: 25_000 },
        { startMs: 17_000, endMs: 23_000 },
        50,
      ),
    ).toBe('The section ends at 0:23.000, before "Chorus".')
  })

  it('gives both texts for a new section between two sections', () => {
    expect(
      sectionTrimNote(
        verse,
        { startMs: 10_000, endMs: 25_000 },
        { startMs: 16_000, endMs: 23_000 },
        50,
      ),
    ).toBe(
      'The section starts at 0:16.000, after "Verse 1". The section ends at 0:23.000, before "Chorus".',
    )
  })

  it('gives no text for a range that only snaps to the frame size or stops at the song end', () => {
    expect(
      sectionTrimNote(
        verse,
        { startMs: 16_010, endMs: 22_990 },
        { startMs: 16_000, endMs: 23_000 },
        50,
      ),
    ).toBeNull()
    expect(
      sectionTrimNote([], { startMs: 1000, endMs: 40_000 }, { startMs: 1000, endMs: 30_000 }, 50),
    ).toBeNull()
  })
})
