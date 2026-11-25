import type { Mark } from '../../store/types.ts'

/** A `[Name]` line of the lyrics, and the index of the first lyrics line after it. */
export type SectionTag = {
  /** The text between the brackets, trimmed and cut to `MAX_SECTION_NAME` characters. */
  name: string
  /** The index, in the lines of `parseLyrics`, of the first lyrics line after the tag. */
  lineIndex: number
}

/** The name and the time range of one section that a tag gives. */
export type TagSectionRange = { name: string; startMs: number; endMs: number }

/**
 * Returns one section range for each tag that has a phrase mark, in time order.
 * The rules:
 * - The phrases of a tag are the lyrics lines from its `lineIndex` to the `lineIndex` of the next tag.
 * - A section starts at the start of the first phrase mark of its tag.
 * - A section ends at the start of the next section. The last section ends at the end of the last phrase mark of the run.
 * - A tag with no phrase mark gives no section. The lyrics lines before the first tag are in no section.
 * @param tags The tags of the lyrics, from `parseSectionTags`.
 * @param phraseIds The id of the phrase mark of each lyrics line, or null when the line gave no mark.
 * @param marks The marks of the run. The function reads the phrase marks only.
 */
export function tagSectionRanges(
  tags: readonly SectionTag[],
  phraseIds: readonly (string | null)[],
  marks: readonly Mark[],
): TagSectionRange[] {
  const phrases = new Map(
    marks.filter((mark) => mark.layer === 'phrase').map((mark) => [mark.id, mark]),
  )
  const lines = phraseIds.map((id) => (id === null ? undefined : phrases.get(id)))
  const starts = tags.flatMap((tag, i) => {
    const endIndex = tags[i + 1]?.lineIndex ?? lines.length
    const first = lines.slice(tag.lineIndex, endIndex).find((mark) => mark !== undefined)
    return first === undefined ? [] : [{ name: tag.name, startMs: first.startMs }]
  })
  const runEndMs = Math.max(0, ...lines.map((mark) => mark?.endMs ?? 0))
  return starts.map((start, i) => ({ ...start, endMs: starts[i + 1]?.startMs ?? runEndMs }))
}
