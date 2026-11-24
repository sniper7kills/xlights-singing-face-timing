const TIME_PATTERN = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/

/**
 * Returns the milliseconds of a time in the form `m:ss.mmm`, for example 12 350 for `0:12.350`.
 * It is the inverse of `formatTime`.
 * - The minutes have one digit or more, because a song can be 15 minutes long.
 * - The seconds have two digits, from `00` to `59`.
 * - The fraction is optional and has one to three digits. `0:12.35` is 12 350 ms.
 * - Spaces before and after the time have no effect.
 * @param text The text that the person types.
 * Returns null for any other text, so the caller can show "Use m:ss.mmm".
 */
export function parseTime(text: string): number | null {
  const match = TIME_PATTERN.exec(text.trim())
  if (match === null) return null
  const [, minutes = '0', seconds = '0', fraction = ''] = match
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(fraction.padEnd(3, '0'))
}
