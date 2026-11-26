/** The length of one loudness window. Whisper gives word times in steps of 20 ms, so a window holds a few steps. */
export const LOUDNESS_WINDOW_MS = 50

/**
 * The loudness limit as a share of the loud windows of the singer tracks: -40 dB.
 * On the demo song, a singer track with no singer had its loudest second at -56 dB of the other track.
 */
export const RELATIVE_LOUDNESS = 0.01

/** The percentile of the windows of both tracks that the limit uses. One loud window, for example a clap, then cannot raise the limit. */
export const LOUD_PERCENTILE = 0.95

/** The windows at the limit that a track needs to have sound: 200 ms in total. One click or one remainder of the other singer is not sound. */
export const MIN_SOUND_WINDOWS = 4

/** The windows before and after the word time that the word search reads: 150 ms. Word times of the speech model are often 100 ms to 300 ms off the sound. */
export const WORD_MARGIN_WINDOWS = 3

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
 * The limit is `RELATIVE_LOUDNESS` of the `LOUD_PERCENTILE` window of all tracks together, and `MIN_LOUDNESS` at least.
 * @param tracks The window loudness of each singer track, from `windowLoudness`.
 */
export function loudnessLimit(tracks: readonly Float32Array[]): number {
  const all = new Float32Array(tracks.reduce((count, loudness) => count + loudness.length, 0))
  let offset = 0
  for (const loudness of tracks) {
    all.set(loudness, offset)
    offset += loudness.length
  }
  all.sort()
  const loud = all[Math.floor(LOUD_PERCENTILE * (all.length - 1))] ?? 0
  return Math.max(loud * RELATIVE_LOUDNESS, MIN_LOUDNESS)
}

/** Returns the count of windows at the loudness limit or above. */
function loudWindows(loudness: Float32Array, limit: number): number {
  let count = 0
  for (const value of loudness) if (value >= limit) count += 1
  return count
}

/** Returns true when the track has `MIN_SOUND_WINDOWS` windows or more at the loudness limit. */
export function hasSound(loudness: Float32Array, limit: number): boolean {
  return loudWindows(loudness, limit) >= MIN_SOUND_WINDOWS
}

/**
 * Returns the words that have sound in their own track, and the count of words that the rule removed.
 * A word stays when one window is at the loudness limit or above, in its time or `WORD_MARGIN_WINDOWS` before or after it.
 * A word after the end of the track and its margin has no window, so the rule removes it.
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
    const start = Math.floor((word.startMs - offsetMs) / LOUDNESS_WINDOW_MS)
    // The speech model can give a word an end before its start, so the word then covers one window.
    const endMs = Math.max(word.startMs, word.endMs) - offsetMs
    const end = Math.max(start, Math.ceil(endMs / LOUDNESS_WINDOW_MS) - 1)
    // A negative index of `subarray` counts from the end, so both ends stay at 0 or above.
    const first = Math.max(0, start - WORD_MARGIN_WINDOWS)
    const after = Math.max(0, end + WORD_MARGIN_WINDOWS + 1)
    return loudWindows(loudness.subarray(first, after), limit) > 0
  })
  return { kept, removedCount: words.length - kept.length }
}
