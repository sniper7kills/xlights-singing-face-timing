import {
  fitSection,
  phrasesOfSection,
  previewSectionEdge,
  type SectionEdge,
  uniqueSectionName,
} from '../../lib/sections/sectionRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, Section, SongContent } from '../types.ts'

// Each action keeps `content.sections` in the order of start time. The section band and the export read it.

/**
 * Returns the content with one new section, and the new section. It does not change its input.
 * Use it inside a step of `songStore.apply`, so an action that adds sections is one undo step.
 * The rules:
 * - The range is the longest free part of `startMs` to `endMs`, by `fitSection`.
 * - The name goes through `uniqueSectionName`, so a duplicate name gets a number.
 * @param content The open song.
 * @param name The name of the section.
 * @param startMs The start of the time range.
 * @param endMs The end of the time range.
 * Returns null when no free part of 1 second or more exists, or when the name has only spaces.
 */
export function addSectionStep(
  content: SongContent,
  name: string,
  startMs: number,
  endMs: number,
): { content: SongContent; section: Section } | null {
  const { sections, song } = content
  const range = fitSection(sections, { startMs, endMs }, song.frameMs, song.durationMs)
  const sectionName = uniqueSectionName(sections, name)
  if (range === null || sectionName === '') return null
  const section: Section = { id: crypto.randomUUID(), songId: song.id, name: sectionName, ...range }
  return {
    content: {
      ...content,
      sections: [...sections, section].toSorted((a, b) => a.startMs - b.startMs),
    },
    section,
  }
}

/**
 * Adds a section to the open song, as one undo step. The rules are those of `addSectionStep`.
 * @param songId The id of the song. An id that is not the open song adds nothing.
 * @param name The name of the section.
 * @param startMs The start of the time range.
 * @param endMs The end of the time range.
 * Returns the new section, or null when no section is added: no room, a name with only spaces, or another song.
 */
export function addSection(
  songId: string,
  name: string,
  startMs: number,
  endMs: number,
): Section | null {
  let added: Section | null = null
  useSongStore.getState().apply((content) => {
    const result = content.song.id === songId ? addSectionStep(content, name, startMs, endMs) : null
    if (result === null) return content
    added = result.section
    return result.content
  })
  return added
}

/** The changes of one section. Each field that is absent stays the same. */
export type SectionPatch = { name?: string; startMs?: number; endMs?: number }

/** Returns the section after the patch, with the rules of `uniqueSectionName` and `previewSectionEdge`. */
function patched(content: SongContent, section: Section, patch: SectionPatch): Section {
  const { sections, song } = content
  let next = section
  if (patch.name !== undefined) {
    const name = uniqueSectionName(sections, patch.name, section.id)
    // A name with only spaces is not a section name, so the section keeps its name.
    if (name !== '') next = { ...next, name }
  }
  for (const edge of ['start', 'end'] as const) {
    const toMs = edge === 'start' ? patch.startMs : patch.endMs
    if (toMs === undefined) continue
    const others = sections.map((item) => (item.id === section.id ? next : item))
    const range = previewSectionEdge(others, section.id, edge, toMs, song.frameMs, song.durationMs)
    if (range !== null) next = { ...next, ...range }
  }
  return next
}

/**
 * Changes the name or the edges of a section of the open song, as one undo step.
 * A name goes through `uniqueSectionName`. An edge goes through `previewSectionEdge`, so it snaps and stops at the
 * adjacent section and at 1 second. A call that changes nothing records no step.
 * @param id The id of the section. An unknown id changes nothing.
 * @param patch The new name, start or end.
 */
export function updateSection(id: string, patch: SectionPatch): void {
  useSongStore.getState().apply((content) => {
    const section = content.sections.find((item) => item.id === id)
    if (section === undefined) return content
    const next = patched(content, section, patch)
    if (
      next.name === section.name &&
      next.startMs === section.startMs &&
      next.endMs === section.endMs
    )
      return content
    return {
      ...content,
      sections: content.sections.map((item) => (item.id === id ? next : item)),
    }
  })
}

/**
 * Moves one edge of a section of the open song by one frame size, as one undo step.
 * The rules are those of `updateSection`.
 * @param id The id of the section.
 * @param edge The edge that moves.
 * @param direction -1 moves the edge earlier, 1 moves it later.
 */
export function stepSectionEdge(id: string, edge: SectionEdge, direction: -1 | 1): void {
  const content = useSongStore.getState().current
  const section = content?.sections.find((item) => item.id === id)
  if (!content || !section) return
  const fromMs = edge === 'start' ? section.startMs : section.endMs
  const toMs = fromMs + direction * content.song.frameMs
  updateSection(id, edge === 'start' ? { startMs: toMs } : { endMs: toMs })
}

/**
 * Deletes a section of the open song, as one undo step. The marks do not change.
 * @param id The id of the section. An unknown id changes nothing.
 */
export function deleteSection(id: string): void {
  useSongStore.getState().apply((content) => {
    if (!content.sections.some((section) => section.id === id)) return content
    return { ...content, sections: content.sections.filter((section) => section.id !== id) }
  })
}

/**
 * Returns the phrases of one voice in a section of the open song, in time order.
 * A phrase belongs to the section that holds its middle, by `phraseInSection`.
 * @param voiceId The id of the voice.
 * @param sectionId The id of the section.
 * Returns an empty list for an unknown section or when no song is open.
 */
export function phrasesInSection(voiceId: string, sectionId: string): Mark[] {
  const content = useSongStore.getState().current
  const section = content?.sections.find((item) => item.id === sectionId)
  if (!content || !section) return []
  return phrasesOfSection(
    section,
    content.marks.filter((mark) => mark.voiceId === voiceId),
  )
}
