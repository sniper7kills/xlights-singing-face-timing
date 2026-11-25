import type { TimeRange } from '../time/timeRange.ts'
import type { SingerRange } from './assignSingers.ts'

/** One voice of a run and the time ranges of its phrases. */
export type VoicePhraseRanges = { voiceId: string; phrases: readonly TimeRange[] }

/** The part of a mark that `phraseRangesOf` reads. */
type PhraseMark = { voiceId: string; layer: string; startMs: number; endMs: number }

/**
 * Returns the phrases of the voice that overlap the range, as time ranges.
 * @param marks The marks of the song.
 * @param voiceId The voice to read.
 * @param range The range of the run.
 */
export function phraseRangesOf(
  marks: readonly PhraseMark[],
  voiceId: string,
  range: TimeRange,
): TimeRange[] {
  return marks
    .filter(
      (mark) =>
        mark.layer === 'phrase' &&
        mark.voiceId === voiceId &&
        mark.endMs > range.startMs &&
        mark.startMs < range.endMs,
    )
    .map((mark) => ({ startMs: mark.startMs, endMs: mark.endMs }))
}

function sharedMs(a: TimeRange, b: TimeRange): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs))
}

/** Returns the ranges sorted by start, with ranges that touch or overlap joined. */
function joined(ranges: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  for (const range of ranges.toSorted((a, b) => a.startMs - b.startMs)) {
    const last = result.at(-1)
    if (last !== undefined && range.startMs <= last.endMs)
      result[result.length - 1] = {
        startMs: last.startMs,
        endMs: Math.max(last.endMs, range.endMs),
      }
    else result.push({ startMs: range.startMs, endMs: range.endMs })
  }
  return result
}

/** Returns the voice whose phrases share the most time with the ranges, or undefined when no phrase touches them. */
function voiceOf(ranges: readonly TimeRange[], voices: readonly VoicePhraseRanges[]) {
  let best: { voiceId: string; ms: number } | undefined
  for (const voice of voices) {
    const ms = ranges.reduce(
      (sum, range) =>
        sum + voice.phrases.reduce((total, phrase) => total + sharedMs(range, phrase), 0),
      0,
    )
    if (ms > 0 && (best === undefined || ms > best.ms)) best = { voiceId: voice.voiceId, ms }
  }
  return best?.voiceId
}

/**
 * Returns the singer numbers of each voice of a singer run, from the lowest number.
 * The stored singer numbers are the numbers of the singer search, not the voice order.
 * So each singer goes to the voice whose phrases share the most time with the ranges of that singer.
 * A singer with no shared time goes to no voice.
 * @param segments The singer ranges of the run, with song times.
 * @param voices The voices of the run and the time ranges of their phrases. On a tie, the earlier voice wins.
 * Returns a map from the voice id to its singers. A voice with no singer has no entry.
 */
export function singersOfVoices(
  segments: readonly SingerRange[],
  voices: readonly VoicePhraseRanges[],
): Map<string, number[]> {
  const bySinger = new Map<number, SingerRange[]>()
  for (const segment of segments)
    bySinger.set(segment.singer, [...(bySinger.get(segment.singer) ?? []), segment])
  const byVoice = new Map<string, number[]>()
  for (const [singer, ranges] of [...bySinger].toSorted(([a], [b]) => a - b)) {
    const voiceId = voiceOf(ranges, voices)
    if (voiceId !== undefined) byVoice.set(voiceId, [...(byVoice.get(voiceId) ?? []), singer])
  }
  return byVoice
}

/**
 * Returns the ranges of the singers, sorted and joined.
 * @param segments The singer ranges of the run, with song times.
 * @param singers The singer numbers to keep.
 */
export function rangesOfSingers(
  segments: readonly SingerRange[],
  singers: readonly number[],
): TimeRange[] {
  return joined(segments.filter((segment) => singers.includes(segment.singer)))
}

/**
 * Returns the time ranges of each voice of a singer run, by the rule of `singersOfVoices`.
 * Two singers on one voice join their ranges.
 * @param segments The singer ranges of the run, with song times.
 * @param voices The voices of the run and the time ranges of their phrases. On a tie, the earlier voice wins.
 * Returns a map from the voice id to its ranges, sorted and joined. A voice with no singer has no entry.
 */
export function singerVoiceRanges(
  segments: readonly SingerRange[],
  voices: readonly VoicePhraseRanges[],
): Map<string, TimeRange[]> {
  return new Map(
    [...singersOfVoices(segments, voices)].map(([voiceId, singers]) => [
      voiceId,
      rangesOfSingers(segments, singers),
    ]),
  )
}
