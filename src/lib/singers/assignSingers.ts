import { MAX_VOICES } from '../voices/voiceRules.ts'

/** A time range of a phrase. */
export type PhraseRange = { id: string; startMs: number; endMs: number }

/** A time range in which one singer sings. It has the shape of `SingerSegment` of the singers worker. */
export type SingerRange = { startMs: number; endMs: number; singer: number }

/**
 * A singer gets a phrase when the singer sings for this share of the phrase length or more.
 * With a lower share, a short breath or a word of a second singer at the edge of the phrase would copy the phrase.
 */
export const SINGER_SHARE = 0.3

/** The singer of a phrase that no singer range touches. It is the singer of the target voice of the run. */
export const FIRST_SINGER = 0

/** Returns the time that the two ranges share, or 0. */
function sharedMs(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs))
}

/** Returns the ranges of each singer, sorted and joined where they touch or overlap, so no time counts twice. */
function rangesBySinger(segments: readonly SingerRange[]): Map<number, SingerRange[]> {
  const bySinger = new Map<number, SingerRange[]>()
  for (const segment of segments.toSorted((a, b) => a.startMs - b.startMs)) {
    const ranges = bySinger.get(segment.singer) ?? []
    const last = ranges.at(-1)
    if (last !== undefined && segment.startMs <= last.endMs)
      ranges[ranges.length - 1] = { ...last, endMs: Math.max(last.endMs, segment.endMs) }
    else ranges.push({ ...segment })
    bySinger.set(segment.singer, ranges)
  }
  return bySinger
}

/**
 * Returns the raw singer numbers of one phrase, from the lowest number.
 * Returns an empty list when no singer range touches the phrase.
 */
function phraseSingers(phrase: PhraseRange, bySinger: ReadonlyMap<number, SingerRange[]>) {
  const lengthMs = phrase.endMs - phrase.startMs
  const shares: { singer: number; ms: number }[] = []
  for (const [singer, ranges] of bySinger) {
    const ms = ranges.reduce((sum, range) => sum + sharedMs(range, phrase), 0)
    if (ms > 0) shares.push({ singer, ms })
  }
  const above = shares.filter((share) => share.ms >= lengthMs * SINGER_SHARE)
  if (above.length > 0) return above.map((share) => share.singer).sort((a, b) => a - b)
  const largest = shares.toSorted((a, b) => b.ms - a.ms || a.singer - b.singer)[0]
  return largest === undefined ? [] : [largest.singer]
}

/** Returns the lists with each singer number replaced by its new number, without repeats, from the lowest. */
function renamed(lists: readonly number[][], newNumber: ReadonlyMap<number, number>): number[][] {
  return lists.map((singers) =>
    [...new Set(singers.map((singer) => newNumber.get(singer) ?? FIRST_SINGER))].sort(
      (a, b) => a - b,
    ),
  )
}

/** Returns the singer numbers 0, 1, 2 … in the order of the first phrase of each singer. */
function renumbered(lists: readonly number[][]): number[][] {
  const newNumber = new Map<number, number>()
  for (const singers of lists)
    for (const singer of singers) if (!newNumber.has(singer)) newNumber.set(singer, newNumber.size)
  return renamed(lists, newNumber)
}

/** Returns the total phrase time of each singer. */
function timeBySinger(lists: readonly number[][], phrases: readonly PhraseRange[]) {
  const totals = new Map<number, number>()
  lists.forEach((singers, index) => {
    const phrase = phrases[index]
    const lengthMs = phrase === undefined ? 0 : phrase.endMs - phrase.startMs
    for (const singer of singers) totals.set(singer, (totals.get(singer) ?? 0) + lengthMs)
  })
  return totals
}

/**
 * Returns the lists with at most `maxSingers` singers.
 * Singer 0 stays. The other singers with the most phrase time stay. Each other singer goes to the nearest earlier singer that stays.
 * The numbers are in the order of first phrase, so the nearest earlier singer is the highest number below it that stays.
 */
function capped(lists: number[][], phrases: readonly PhraseRange[], maxSingers: number) {
  const totals = timeBySinger(lists, phrases)
  if (totals.size <= maxSingers) return lists
  const kept = [...totals.keys()]
    .filter((singer) => singer !== FIRST_SINGER)
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a - b)
    .slice(0, Math.max(0, maxSingers - 1))
  kept.push(FIRST_SINGER)
  const newNumber = new Map<number, number>()
  for (const singer of totals.keys()) {
    const target = Math.max(...kept.filter((keptSinger) => keptSinger <= singer))
    newNumber.set(singer, target)
  }
  return renumbered(renamed(lists, newNumber))
}

/**
 * Returns the singers of each phrase, as numbers 0, 1, 2 … in the order of the first phrase of each singer.
 *
 * The rules:
 * - A singer gets a phrase when its ranges cover `SINGER_SHARE` (30%) of the phrase or more.
 * - If no singer reaches the share, the singer with the most time in the phrase gets it.
 * - A phrase that no singer range touches goes to singer 0.
 * - A phrase with more than one singer lists them from the lowest number.
 * - The result has `maxSingers` singers at most. Singer 0 stays. The other singers with the most phrase time stay.
 *   Each other singer goes to the nearest earlier singer that stays.
 * @param phrases The phrases of the run, with song times.
 * @param segments The singer ranges, with song times. Ranges of different singers can overlap.
 * @param maxSingers The most singers in the result. A value below 1 counts as 1. Default `MAX_VOICES`.
 * Returns a map from each phrase id to its singers. Each list has one singer or more.
 */
export function assignSingers(
  phrases: readonly PhraseRange[],
  segments: readonly SingerRange[],
  maxSingers: number = MAX_VOICES,
): Map<string, number[]> {
  const ordered = phrases.toSorted((a, b) => a.startMs - b.startMs)
  const bySinger = rangesBySinger(segments)
  // A phrase with no singer keeps an empty list until the end, so it does not decide the number of a singer.
  const raw = ordered.map((phrase) => phraseSingers(phrase, bySinger))
  const lists = capped(renumbered(raw), ordered, Math.max(1, maxSingers)).map((singers) =>
    singers.length === 0 ? [FIRST_SINGER] : singers,
  )
  return new Map(ordered.map((phrase, index) => [phrase.id, lists[index] ?? [FIRST_SINGER]]))
}

/** The counts that tell how `assignSingers` gave the phrases to the singers. */
export type AssignmentStats = {
  /** The singers that got one phrase or more, with no limit of singers. */
  singersWithPhrases: number
  /** The phrases that no singer range touches. `assignSingers` gives them to singer 0. */
  phrasesWithNoSinger: number
  /** The phrases that two or more singers got. */
  phrasesWithMoreSingers: number
}

/**
 * Returns the counts of the assignment of `assignSingers` with no limit of singers.
 * @param phrases The phrases of the run, with song times.
 * @param segments The singer ranges, with song times.
 */
export function assignmentStats(
  phrases: readonly PhraseRange[],
  segments: readonly SingerRange[],
): AssignmentStats {
  const lists = [...assignSingers(phrases, segments, Infinity).values()]
  return {
    singersWithPhrases: new Set(lists.flat()).size,
    phrasesWithNoSinger: phrases.filter((phrase) =>
      segments.every((segment) => sharedMs(segment, phrase) === 0),
    ).length,
    phrasesWithMoreSingers: lists.filter((singers) => singers.length > 1).length,
  }
}
