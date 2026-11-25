import type { TimeRange } from '../time/timeRange.ts'
import type { SingerRange } from './assignSingers.ts'

/** One voice of a run and the time ranges of its phrases. */
export type VoicePhraseRanges = { voiceId: string; phrases: readonly TimeRange[] }

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
 * Returns the time ranges of each voice of a singer run.
 * The stored singer numbers are the numbers of the singer search, not the voice order.
 * So each singer goes to the voice whose phrases share the most time with the ranges of that singer.
 * A singer with no shared time goes to no voice. Two singers on one voice join their ranges.
 * @param segments The singer ranges of the run, with song times.
 * @param voices The voices of the run and the time ranges of their phrases. On a tie, the earlier voice wins.
 * Returns a map from the voice id to its ranges, sorted and joined. A voice with no singer has no entry.
 */
export function singerVoiceRanges(
  segments: readonly SingerRange[],
  voices: readonly VoicePhraseRanges[],
): Map<string, TimeRange[]> {
  const bySinger = new Map<number, SingerRange[]>()
  for (const segment of segments)
    bySinger.set(segment.singer, [...(bySinger.get(segment.singer) ?? []), segment])
  const byVoice = new Map<string, TimeRange[]>()
  for (const ranges of bySinger.values()) {
    const voiceId = voiceOf(ranges, voices)
    if (voiceId !== undefined) byVoice.set(voiceId, [...(byVoice.get(voiceId) ?? []), ...ranges])
  }
  return new Map([...byVoice].map(([voiceId, ranges]) => [voiceId, joined(ranges)]))
}
