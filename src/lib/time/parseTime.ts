import { formatTime } from './formatTime.ts'

const CLOCK_PATTERN = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/
const SECONDS_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/

function fractionMs(fraction = ''): number {
  return Number(fraction.padEnd(3, '0'))
}

/**
 * Returns the milliseconds of a typed time, for example 12 350 for `0:12.350` or for `12.35`.
 * It is the inverse of `formatTime`.
 * - The form `m:ss.mmm` has one digit or more for the minutes, because a song can be 15 minutes long.
 *   The seconds have two digits. Seconds of 60 or more add to the minutes, so `0:99` is 99 000 ms.
 * - The form `s.mmm` is plain seconds, for example `3.5` for 3 500 ms.
 * - The fraction is optional and has one to three digits. `0:12.35` is 12 350 ms.
 * - Spaces before and after the time have no effect.
 * @param text The text that the person types.
 * Returns null for any other text.
 */
export function parseTime(text: string): number | null {
  const trimmed = text.trim()
  const clock = CLOCK_PATTERN.exec(trimmed)
  if (clock !== null)
    return Number(clock[1]) * 60_000 + Number(clock[2]) * 1000 + fractionMs(clock[3])
  const seconds = SECONDS_PATTERN.exec(trimmed)
  return seconds === null ? null : Number(seconds[1]) * 1000 + fractionMs(seconds[2])
}

/** The result of a typed time: the milliseconds, or the text of the field error. */
export type TimeInput = { ms: number } | { error: string }

/**
 * Returns the milliseconds of a typed time, or a field error that states the cause.
 * The copy is in the timeline editor feature file.
 * @param text The text that the person types.
 * @param durationMs The length of the song. A later time is an error.
 */
export function readTime(text: string, durationMs: number): TimeInput {
  const trimmed = text.trim()
  if (trimmed === '') return { error: 'Type a time, for example 0:03.500 or 3.5.' }
  if (trimmed.startsWith('-')) return { error: 'Type a time of 0 or more.' }
  const ms = parseTime(trimmed)
  if (ms === null) return { error: 'Use m:ss.mmm or seconds, for example 0:03.500 or 3.5.' }
  if (ms > durationMs) return { error: `The song ends at ${formatTime(durationMs)}.` }
  return { ms }
}
