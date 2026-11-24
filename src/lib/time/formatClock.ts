/**
 * Returns a time as `m:ss`, for example `1:12` for 72 000 ms.
 * A progress text shows whole seconds, so the function drops the fraction of a second.
 * @param ms The time in milliseconds. A negative time shows as `0:00`.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
