import { describe, expect, it } from 'vitest'
import { mark } from '../marks/fixtures.test-helpers.ts'
import { tagSectionRanges } from './tagSections.ts'

const phrase = (id: string, startMs: number, endMs: number) =>
  mark(id, { layer: 'phrase', startMs, endMs })

// Four lyrics lines, one phrase mark each, and one word mark that the rule ignores.
const MARKS = [
  phrase('p0', 0, 1000),
  phrase('p1', 1000, 3000),
  mark('w1', { startMs: 1000, endMs: 2000, parentId: 'p1' }),
  phrase('p2', 3000, 5000),
  phrase('p3', 5000, 8000),
]
const IDS = ['p0', 'p1', 'p2', 'p3']

describe('tagSectionRanges', () => {
  it('gives one range for each tag, from its first phrase to the start of the next range', () => {
    const tags = [
      { name: 'Verse 1', lineIndex: 1 },
      { name: 'Chorus', lineIndex: 2 },
    ]

    expect(tagSectionRanges(tags, IDS, MARKS)).toEqual([
      { name: 'Verse 1', startMs: 1000, endMs: 3000 },
      { name: 'Chorus', startMs: 3000, endMs: 8000 },
    ])
  })

  it('ends the last range at the end of the last phrase mark of the run', () => {
    const tags = [{ name: 'Verse', lineIndex: 0 }]

    expect(tagSectionRanges(tags, ['p0', 'p1', null], MARKS)).toEqual([
      { name: 'Verse', startMs: 0, endMs: 3000 },
    ])
  })

  it('gives no range to a tag whose phrases have no mark', () => {
    const tags = [
      { name: 'Intro', lineIndex: 0 },
      { name: 'Verse', lineIndex: 1 },
      { name: 'Outro', lineIndex: 3 },
    ]

    expect(tagSectionRanges(tags, ['p0', 'p1', 'p2', null], MARKS)).toEqual([
      { name: 'Intro', startMs: 0, endMs: 1000 },
      { name: 'Verse', startMs: 1000, endMs: 5000 },
    ])
  })

  it('starts a range at the first kept phrase of its tag', () => {
    const tags = [{ name: 'Chorus', lineIndex: 0 }]

    expect(tagSectionRanges(tags, [null, 'p2', 'p3'], MARKS)).toEqual([
      { name: 'Chorus', startMs: 3000, endMs: 8000 },
    ])
  })

  it('gives no range to the first of two tags in sequence or to a tag at the end', () => {
    const tags = [
      { name: 'Intro', lineIndex: 2 },
      { name: 'Verse', lineIndex: 2 },
      { name: 'End', lineIndex: 4 },
    ]

    expect(tagSectionRanges(tags, IDS, MARKS)).toEqual([
      { name: 'Verse', startMs: 3000, endMs: 8000 },
    ])
  })

  it('gives no range for no tag', () => {
    expect(tagSectionRanges([], IDS, MARKS)).toEqual([])
  })
})
