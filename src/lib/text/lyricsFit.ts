/**
 * How the lyrics of a run fit in the range of the run.
 * - `wordCount`: the words of all lyrics lines.
 * - `room`: the words that fit in the range, one frame size for each word. See `wordRoom`.
 * - `keptLineCount`: the lines that the run keeps.
 * - `lineCount`: the lyrics lines.
 */
export type LyricsFit = {
  wordCount: number
  room: number
  keptLineCount: number
  lineCount: number
}

/**
 * Returns how the lyrics lines fit in the room of the range.
 * The run keeps the first lines whose words all fit, and leaves out each line after them.
 * The run always keeps the first line, and the frame rule then keeps the earliest words of that line that fit.
 * @param lineWordCounts The count of words of each lyrics line, in order.
 * @param room The count of words that fit in the range.
 */
export function fitLyricsLines(lineWordCounts: readonly number[], room: number): LyricsFit {
  let wordCount = 0
  let keptLineCount = 0
  for (const count of lineWordCounts) {
    wordCount += count
    if (wordCount <= room) keptLineCount += 1
  }
  return {
    wordCount,
    room,
    keptLineCount: Math.min(lineWordCounts.length, Math.max(1, keptLineCount)),
    lineCount: lineWordCounts.length,
  }
}

/** Returns true when the run leaves out one lyrics line or more. */
export function leavesOutLines(fit: LyricsFit): boolean {
  return fit.keptLineCount < fit.lineCount
}
