/** The length of one level window. Whisper gives word times in steps of 20 ms, so a window holds a few steps. */
export const LEVEL_WINDOW_MS = 50

/**
 * The level limit as a share of the loudest window of the singer tracks: -40 dB.
 * On the demo song, a model track with no singer had its loudest second at -56 dB of the other track.
 */
export const RELATIVE_LEVEL = 0.01

/** The lowest level limit: -60 dB of full scale. Without it, a run with no singing at all keeps the noise. */
export const MIN_LEVEL = 0.001

/**
 * Returns the RMS level of each window of `LEVEL_WINDOW_MS` of the samples. The last window can be shorter.
 * @param samples One channel.
 * @param sampleRate The sample rate of the samples.
 */
export function windowLevels(samples: Float32Array, sampleRate: number): Float32Array {
  const size = Math.max(1, Math.round((sampleRate * LEVEL_WINDOW_MS) / 1000))
  const levels = new Float32Array(Math.ceil(samples.length / size))
  for (let window = 0; window < levels.length; window++) {
    const start = window * size
    const end = Math.min(samples.length, start + size)
    let sum = 0
    for (let index = start; index < end; index++) sum += (samples[index] ?? 0) ** 2
    levels[window] = Math.sqrt(sum / (end - start))
  }
  return levels
}

/**
 * Returns the level limit of a run: a window at this level or above has a voice.
 * The limit is `RELATIVE_LEVEL` of the loudest window of all tracks, and `MIN_LEVEL` at least.
 * @param tracks The window levels of each singer track, from `windowLevels`.
 */
export function voiceLevel(tracks: readonly Float32Array[]): number {
  let loudest = 0
  for (const levels of tracks) for (const level of levels) loudest = Math.max(loudest, level)
  return Math.max(loudest * RELATIVE_LEVEL, MIN_LEVEL)
}

/** Returns true when one window or more of the track is at the limit or above. */
export function hasVoice(levels: Float32Array, limit: number): boolean {
  return levels.some((level) => level >= limit)
}

/**
 * Returns the words that have a voice in their own track, and the count of words that the rule removed.
 * A word stays when one window that its time touches is at the limit or above.
 * A word after the end of the track has no window, so the rule removes it.
 * @param words The words of the track, with song times.
 * @param levels The window levels of the track, from `windowLevels`.
 * @param limit The level limit, from `voiceLevel`.
 * @param offsetMs The song time of the first sample of the track.
 */
export function voicedWords<T extends { startMs: number; endMs: number }>(
  words: readonly T[],
  levels: Float32Array,
  limit: number,
  offsetMs: number,
): { kept: T[]; removedCount: number } {
  const kept = words.filter((word) => {
    const first = Math.max(0, Math.floor((word.startMs - offsetMs) / LEVEL_WINDOW_MS))
    // The speech model can give a word an end before its start, so the word then covers one window.
    const endMs = Math.max(word.startMs, word.endMs) - offsetMs
    const last = Math.max(first, Math.ceil(endMs / LEVEL_WINDOW_MS) - 1)
    return hasVoice(levels.subarray(first, last + 1), limit)
  })
  return { kept, removedCount: words.length - kept.length }
}
