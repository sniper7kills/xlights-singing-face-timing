import { describe, expect, it } from 'vitest'
import { fitLyricsLines, leavesOutLyrics } from './lyricsFit.ts'

describe('fitLyricsLines', () => {
  it('keeps all lines when the words fit in the room', () => {
    const fit = fitLyricsLines([3, 4, 2], 9)

    expect(fit).toEqual({
      wordCount: 9,
      room: 9,
      keptLineCount: 3,
      lineCount: 3,
      firstLineCut: false,
    })
    expect(leavesOutLyrics(fit)).toBe(false)
  })

  it('keeps 82 lines of 7 words in a song of 28.9 s at 50 ms, and leaves out lines 83 to 200', () => {
    const fit = fitLyricsLines(
      Array.from({ length: 200 }, () => 7),
      578,
    )

    expect(fit).toEqual({
      wordCount: 1400,
      room: 578,
      keptLineCount: 82,
      lineCount: 200,
      firstLineCut: false,
    })
    expect(leavesOutLyrics(fit)).toBe(true)
  })

  it('keeps no line after a line that does not fit, also when a later line is short', () => {
    expect(fitLyricsLines([2, 5, 1], 4).keptLineCount).toBe(1)
  })

  it('keeps the first line when even the first line does not fit', () => {
    const fit = fitLyricsLines([6, 2], 4)

    expect(fit.keptLineCount).toBe(1)
    expect(fit.firstLineCut).toBe(true)
    expect(leavesOutLyrics(fit)).toBe(true)
  })

  it('asks for one line that alone has more words than the room', () => {
    const fit = fitLyricsLines([6], 4)

    expect(fit).toMatchObject({ keptLineCount: 1, lineCount: 1, firstLineCut: true })
    expect(leavesOutLyrics(fit)).toBe(true)
  })

  it('gives no line for lyrics with no line', () => {
    expect(fitLyricsLines([], 10)).toEqual({
      wordCount: 0,
      room: 10,
      keptLineCount: 0,
      lineCount: 0,
      firstLineCut: false,
    })
  })
})
