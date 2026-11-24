/**
 * Returns a time as `m:ss.mmm`, for example `0:01.500` for 1500 ms.
 * The minutes have no upper limit, because a song can be 15 minutes long.
 * @param ms The time in milliseconds. A fraction rounds to the nearest millisecond.
 */
export function formatTime(ms: number): string {
  const total = Math.round(ms)
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}
