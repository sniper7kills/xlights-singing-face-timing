import { MAX_VOICES } from '../voices/voiceRules.ts'

/** A time range of a phrase. */
export type PhraseRange = { id: string; startMs: number; endMs: number }

/** A time range in which one singer sings. It has the shape of `SingerSegment` of the singers worker. */
export type SingerRange = { startMs: number; endMs: number; singer: number }

/**
 * A second singer also gets a phrase when its time in the phrase is this share of the time of the top singer or more.
 * Issue #148 measured it on "Baby, It's Cold Outside" with the base speech model (37 phrases, see ADR 0009).
 * The rule of 30% of the phrase before it gave 6 phrases of one singer an extra copy, and this share gives none.
 * The shares 0.6 to 0.9 gave the same counts. 0.5 gave 2 extra copies, and 1.0 put 2 more phrases of a control on the wrong voice.
 */
export const SECOND_SINGER_RATIO = 0.8

/**
 * A second singer also gets a phrase only when it sings this long in the phrase or more, in milliseconds.
 * It keeps a breath at the edge of a short phrase from a copy. The values 0 to 2000 gave the same counts on the song.
 */
export const SECOND_SINGER_MS = 1000

/** The singer of a phrase that no singer range touches. It is the singer of the target voice of the run. */
export const FIRST_SINGER = 0

/** Returns the time that the two ranges share, or 0. */
function sharedMs(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs))
}

/** Returns the ranges of each singer, sorted and joined where they touch or overlap, so no time counts twice. */
export function rangesBySinger(segments: readonly SingerRange[]): Map<number, SingerRange[]> {
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

/** Returns the time of each singer in the phrase, for each singer with time in it. */
export function singerTimes(
  phrase: { startMs: number; endMs: number },
  bySinger: ReadonlyMap<number, SingerRange[]>,
): { singer: number; ms: number }[] {
  const times: { singer: number; ms: number }[] = []
  for (const [singer, ranges] of bySinger) {
    const ms = ranges.reduce((sum, range) => sum + sharedMs(range, phrase), 0)
    if (ms > 0) times.push({ singer, ms })
  }
  return times
}

/**
 * Returns the raw singer numbers of one phrase, from the lowest number.
 * The top singer gets the phrase. A second singer also gets it with `SECOND_SINGER_RATIO` of the top time and `SECOND_SINGER_MS`.
 * Returns an empty list when no singer range touches the phrase.
 */
function phraseSingers(phrase: PhraseRange, bySinger: ReadonlyMap<number, SingerRange[]>) {
  const times = singerTimes(phrase, bySinger)
  const topMs = Math.max(0, ...times.map((time) => time.ms))
  return times
    .filter(
      (time) =>
        time.ms === topMs ||
        (time.ms >= topMs * SECOND_SINGER_RATIO && time.ms >= SECOND_SINGER_MS),
    )
    .map((time) => time.singer)
    .sort((a, b) => a - b)
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
 * - The singer with the most time in the phrase gets it. Two singers with the same top time both get it.
 * - A second singer also gets the phrase when its time is `SECOND_SINGER_RATIO` (80%) of the top time or more,
 *   and `SECOND_SINGER_MS` (1 s) or more.
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
