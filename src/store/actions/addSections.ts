import type { TagSectionRange } from '../../lib/sections/tagSections.ts'
import { useSongStore } from '../songStore.ts'
import type { Section } from '../types.ts'
import { addSectionStep } from './sections.ts'

/**
 * Adds the sections to the open song, in time order, as one undo step.
 * Each item goes through `addSectionStep`, so:
 * - a duplicate name gets a number, for example "Chorus 2",
 * - an item over a section that exists gets the longest free part of its range,
 * - an item with no free part of 1 second or more gives no section.
 * @param songId The id of the song. An id that is not the open song adds nothing.
 * @param items The names and the time ranges of the sections.
 * Returns the sections that the action made. With no section made, the action records no step.
 */
export function addSections(songId: string, items: readonly TagSectionRange[]): Section[] {
  const added: Section[] = []
  useSongStore.getState().apply((content) => {
    if (content.song.id !== songId) return content
    let next = content
    for (const item of items.toSorted((a, b) => a.startMs - b.startMs)) {
      const result = addSectionStep(next, item.name, item.startMs, item.endMs)
      if (result === null) continue
      next = result.content
      added.push(result.section)
    }
    return next
  })
  return added
}
