/** The length of one loudness window. Whisper gives word times in steps of 20 ms, so a window holds a few steps. */
export const LOUDNESS_WINDOW_MS = 50

/**
 * The loudness limit as a share of the loudest window of the singer tracks: -40 dB.
 * On the demo song, a singer track with no singer had its loudest window at -56 dB of the other track.
 */
export const RELATIVE_LOUDNESS = 0.01

/** The lowest loudness limit: -60 dB of full scale. Without it, a run with no singing at all keeps the noise. */
export const MIN_LOUDNESS = 0.001

/**
 * Returns the loudness of each window of `LOUDNESS_WINDOW_MS`: the root mean square of its samples. The last window can be shorter.
 * @param samples One channel.
 * @param sampleRate The sample rate of the samples.
 */
export function windowLoudness(samples: Float32Array, sampleRate: number): Float32Array {
  const size = Math.max(1, Math.round((sampleRate * LOUDNESS_WINDOW_MS) / 1000))
  const loudness = new Float32Array(Math.ceil(samples.length / size))
  for (let window = 0; window < loudness.length; window++) {
    const start = window * size
    const end = Math.min(samples.length, start + size)
    let sum = 0
    for (let index = start; index < end; index++) sum += (samples[index] ?? 0) ** 2
    loudness[window] = Math.sqrt(sum / (end - start))
  }
  return loudness
}

/**
 * Returns the loudness limit of a run: a window at this loudness or above has sound.
 * The limit is `RELATIVE_LOUDNESS` of the loudest window of all tracks, and `MIN_LOUDNESS` at least.
 * @param tracks The window loudness of each singer track, from `windowLoudness`.
 */
export function loudnessLimit(tracks: readonly Float32Array[]): number {
  let loudest = 0
  for (const loudness of tracks) for (const value of loudness) loudest = Math.max(loudest, value)
  return Math.max(loudest * RELATIVE_LOUDNESS, MIN_LOUDNESS)
}

/** Returns true when one window or more is at the loudness limit or above. */
export function hasSound(loudness: Float32Array, limit: number): boolean {
  return loudness.some((value) => value >= limit)
}

/**
 * Returns the words that have sound in their own track, and the count of words that the rule removed.
 * A word stays when one window that its time touches is at the loudness limit or above.
 * A word after the end of the track has no window, so the rule removes it.
 * @param words The words of the track, with song times.
 * @param loudness The window loudness of the track, from `windowLoudness`.
 * @param limit The loudness limit, from `loudnessLimit`.
 * @param offsetMs The song time of the first sample of the track.
 */
export function soundWords<T extends { startMs: number; endMs: number }>(
  words: readonly T[],
  loudness: Float32Array,
  limit: number,
  offsetMs: number,
): { kept: T[]; removedCount: number } {
  const kept = words.filter((word) => {
    const first = Math.max(0, Math.floor((word.startMs - offsetMs) / LOUDNESS_WINDOW_MS))
    // The speech model can give a word an end before its start, so the word then covers one window.
    const endMs = Math.max(word.startMs, word.endMs) - offsetMs
    const last = Math.max(first, Math.ceil(endMs / LOUDNESS_WINDOW_MS) - 1)
    return hasSound(loudness.subarray(first, last + 1), limit)
  })
  return { kept, removedCount: words.length - kept.length }
}
