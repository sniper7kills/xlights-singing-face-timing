/** The longest song name that the app accepts, after the trim. */
export const MAX_SONG_NAME_LENGTH = 80

const BYTES_PER_MB = 1024 * 1024

/**
 * Returns the name with the spaces at both ends removed, or null when the trimmed name
 * has fewer than 1 or more than MAX_SONG_NAME_LENGTH characters.
 */
export function normalizeSongName(name: string): string | null {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_SONG_NAME_LENGTH ? trimmed : null
}

/** Returns a song duration as `m:ss`, to the nearest second. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Returns the date of the last change of a song, in the local time zone:
 * - "Changed today 14:02" for a change today.
 * - "Changed yesterday" for a change yesterday.
 * - "Changed 2026-10-19" for an earlier or a later change.
 * @param updatedAt The ISO 8601 date and time of the last change.
 * @param now The current time.
 */
export function formatChangeDate(updatedAt: string, now: Date): string {
  const changed = new Date(updatedAt)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (localDate(changed) === localDate(now)) {
    const hours = String(changed.getHours()).padStart(2, '0')
    const minutes = String(changed.getMinutes()).padStart(2, '0')
    return `Changed today ${hours}:${minutes}`
  }
  if (localDate(changed) === localDate(yesterday)) return 'Changed yesterday'
  return `Changed ${localDate(changed)}`
}

/** Returns a byte count in MB: one decimal below 10 MB, else a whole number. */
export function formatMegabytes(bytes: number): string {
  const megabytes = bytes / BYTES_PER_MB
  return megabytes < 10 ? megabytes.toFixed(1) : String(Math.round(megabytes))
}
