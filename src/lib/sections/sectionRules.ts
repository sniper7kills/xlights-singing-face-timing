import type { Mark, Section } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import type { TimeRange } from '../time/timeRange.ts'

/** A section is 1 second long or more. */
export const MIN_SECTION_MS = 1000

/** A section name has 40 characters at most. */
export const MAX_SECTION_NAME = 40

/** The edge of a section that a drag or an arrow key moves. */
export type SectionEdge = 'start' | 'end'

/**
 * Returns true when the phrase belongs to the section: the middle of the phrase is at or after the section start
 * and before the section end. A phrase that spans two sections belongs to the section that holds its middle.
 * The export and `phrasesInSection` both use this rule.
 * @param section The section.
 * @param phrase A mark of the phrase layer.
 */
export function phraseInSection(section: TimeRange, phrase: TimeRange): boolean {
  const middle = (phrase.startMs + phrase.endMs) / 2
  return middle >= section.startMs && middle < section.endMs
}

/** Returns the last multiple of the frame size in the song. A section edge stops there. */
function lastFrameMs(durationMs: number, frameMs: number): number {
  return Math.floor(durationMs / frameMs) * frameMs
}

/** Returns the parts of `range` that no section covers, in time order. */
function freeParts(sections: readonly Section[], range: TimeRange): TimeRange[] {
  const parts: TimeRange[] = []
  let cursor = range.startMs
  const sorted = sections.toSorted((a, b) => a.startMs - b.startMs)
  for (const section of sorted) {
    if (section.startMs > cursor) {
      parts.push({ startMs: cursor, endMs: Math.min(section.startMs, range.endMs) })
    }
    cursor = Math.max(cursor, section.endMs)
    if (cursor >= range.endMs) break
  }
  if (cursor < range.endMs) parts.push({ startMs: cursor, endMs: range.endMs })
  return parts.filter((part) => part.endMs > part.startMs)
}

/**
 * Returns the range of a new section: the longest part of `range` that no section covers.
 * The rules:
 * - Each time snaps to the frame size.
 * - The range stays from 0 to the last multiple of the frame size in the song.
 * - Of two free parts with the same length, the earlier part wins.
 * @param sections The sections of the song. They do not overlap.
 * @param range The time selection.
 * @param frameMs The frame size of the song.
 * @param durationMs The duration of the song.
 * Returns null when the longest free part is shorter than `MIN_SECTION_MS`.
 */
export function fitSection(
  sections: readonly Section[],
  range: TimeRange,
  frameMs: number,
  durationMs: number,
): TimeRange | null {
  const last = lastFrameMs(durationMs, frameMs)
  const startMs = Math.max(0, snap(range.startMs, frameMs))
  const endMs = Math.min(last, snap(range.endMs, frameMs))
  let best: TimeRange | null = null
  for (const part of freeParts(sections, { startMs, endMs })) {
    if (best === null || part.endMs - part.startMs > best.endMs - best.startMs) best = part
  }
  return best !== null && best.endMs - best.startMs >= MIN_SECTION_MS ? best : null
}

/** Cuts the name to the 40 characters of a section name, with no space at the end. */
function limit(name: string): string {
  return name.slice(0, MAX_SECTION_NAME).trimEnd()
}

/**
 * Returns a section name that no other section of the song has, without regard to letter case.
 * The name is trimmed and cut to `MAX_SECTION_NAME` characters.
 * A name that exists gets the lowest free number from 2 after a space, for example "Chorus 2".
 * The number stays inside the 40 characters, so a long name loses characters at its end.
 * @param sections The sections of the song.
 * @param name The name that the person typed.
 * @param exceptId The id of the section that gets the name. Its own name does not count.
 * Returns an empty string for a name with only spaces.
 */
export function uniqueSectionName(
  sections: readonly Section[],
  name: string,
  exceptId?: string,
): string {
  const base = limit(name.trim())
  if (base === '') return ''
  const taken = new Set(
    sections
      .filter((section) => section.id !== exceptId)
      .map((section) => section.name.toLowerCase()),
  )
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`
    const candidate = `${limit(base.slice(0, MAX_SECTION_NAME - suffix.length))}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/**
 * Returns the default name of a new section: "Section N", with the lowest N from 1 that no section has.
 * The check ignores letter case, the same as `uniqueSectionName`.
 * @param sections The sections of the song.
 */
export function nextSectionName(sections: readonly Section[]): string {
  const taken = new Set(sections.map((section) => section.name.toLowerCase()))
  let n = 1
  while (taken.has(`section ${n}`)) n += 1
  return `Section ${n}`
}

/**
 * Returns the range of a section after a move of one edge.
 * The rules:
 * - The time snaps to the frame size.
 * - The start stops at the end of the section before it, and at 0.
 * - The end stops at the start of the section after it, and at the last multiple of the frame size in the song.
 * - The section stays `MIN_SECTION_MS` long or more.
 * @param sections The sections of the song. They do not overlap.
 * @param id The id of the section.
 * @param edge The edge that moves.
 * @param toMs The time of the pointer or of the key step.
 * @param frameMs The frame size of the song.
 * @param durationMs The duration of the song.
 * Returns null for an unknown id. Returns the range with no change when no legal time exists.
 */
export function previewSectionEdge(
  sections: readonly Section[],
  id: string,
  edge: SectionEdge,
  toMs: number,
  frameMs: number,
  durationMs: number,
): TimeRange | null {
  const section = sections.find((item) => item.id === id)
  if (section === undefined) return null
  const range = { startMs: section.startMs, endMs: section.endMs }
  const others = sections.filter((item) => item.id !== id)
  const [lower, upper] =
    edge === 'start'
      ? [
          Math.max(0, ...others.filter((s) => s.endMs <= section.startMs).map((s) => s.endMs)),
          section.endMs - MIN_SECTION_MS,
        ]
      : [
          section.startMs + MIN_SECTION_MS,
          Math.min(
            lastFrameMs(durationMs, frameMs),
            ...others.filter((s) => s.startMs >= section.endMs).map((s) => s.startMs),
          ),
        ]
  if (lower > upper) return range
  const time = Math.min(upper, Math.max(lower, snap(toMs, frameMs)))
  return edge === 'start' ? { ...range, startMs: time } : { ...range, endMs: time }
}

/**
 * Returns the sections in time order with each time snapped to the frame size, inside the song.
 * The rules:
 * - Each time snaps to the frame size. A snap keeps the time order and keeps a length of 1 second or more,
 *   because 1 second is a multiple of each frame size.
 * - An end stops at the last multiple of the frame size in the song, and at the start of the next section.
 * - A section that this stop makes shorter than `MIN_SECTION_MS` gets an earlier start, so it stays 1 second long.
 *   The end of the section before it then stops at that start.
 * - A section that cannot stay 1 second long after 0 goes from the result.
 *   A song that holds a valid section at 25 ms holds it at 50 ms too, so a frame size change removes no section.
 * - A section with no change keeps its object.
 * @param sections The sections of the song. They do not overlap.
 * @param frameMs The new frame size.
 * @param durationMs The duration of the song.
 */
export function snapSections(
  sections: readonly Section[],
  frameMs: number,
  durationMs: number,
): Section[] {
  const kept: Section[] = []
  // The pass goes from the last section to the first, so each end knows the start of the section after it.
  let limitMs = lastFrameMs(durationMs, frameMs)
  for (const section of sections.toSorted((a, b) => b.startMs - a.startMs)) {
    const endMs = Math.min(snap(section.endMs, frameMs), limitMs)
    const startMs = Math.min(snap(section.startMs, frameMs), endMs - MIN_SECTION_MS)
    if (startMs < 0) continue
    kept.push(
      startMs === section.startMs && endMs === section.endMs
        ? section
        : { ...section, startMs, endMs },
    )
    limitMs = startMs
  }
  return kept.reverse()
}

/**
 * Returns the phrases of the section in time order.
 * @param section The section.
 * @param marks The marks of one voice, or of the song.
 */
export function phrasesOfSection(section: TimeRange, marks: readonly Mark[]): Mark[] {
  return marks
    .filter((mark) => mark.layer === 'phrase' && phraseInSection(section, mark))
    .toSorted((a, b) => a.startMs - b.startMs)
}
