// The singer diagnostics hold counts, times and distances only, so a person can paste them into a chat. No audio and no lyrics.

/**
 * The reason that a raw group joined another group:
 * - `small-group`: the group had fewer embeddings than the minimum group size.
 * - `cap`: the clustering had more groups than the highest count of singers.
 * - `share`: the group had less sung time than the minimum share of all sung time.
 * - `time`: the group had less sung time than the minimum sung time.
 */
export type JoinReason = 'small-group' | 'cap' | 'share' | 'time'

/** What happened to one raw group. A kept group with no range after the range limits has no singer number. */
export type GroupFate =
  { kind: 'kept'; singer: number | null } | { kind: 'joined'; into: number; reason: JoinReason }

/** One group of the clustering after the threshold merge, before each later join. */
export type RawGroup = {
  /** The number of the raw group, in the order of its first embedding. */
  group: number
  /** The sung time of the group in whole milliseconds. */
  sungMs: number
  embeddingCount: number
  fate: GroupFate
}

/** One singer of the result, with its sung time and its count of ranges. */
export type FinalSinger = { singer: number; sungMs: number; rangeCount: number }

/** The settings of the singer search that were in force for one run. */
export type DiagnosticSettings = {
  /** The merge threshold: a distance between the centroids of unit-length embeddings. */
  threshold: number
  /** The minimum group size in force. The engine lowers it for a short input. */
  minGroupSize: number
  maxSingers: number
  /** The share of all sung time under which a singer joins another singer, from 0 to 1. */
  minSingerShare: number
  /** The sung time under which a singer joins another singer, in milliseconds. */
  minSingerMs: number
}

/** The smallest, the median and the largest distance between the centroids of the raw groups. */
export type DistanceSummary = { min: number; median: number; max: number }

/** The numbers of one singer search that tell a person why the search found the singers that it found. */
export type SingerDiagnostics = {
  audioMs: number
  /** The count of model windows that the search read. */
  windowCount: number
  /** The frames in which one or more singers sing. */
  framesWithSpeech: number
  /** The time in which one or more singers sing, in whole milliseconds. */
  sungMs: number
  /** The count of local speakers that got an embedding. */
  embeddingCount: number
  /** The embeddings with a value that is not finite. They count for no singer. */
  droppedEmbeddings: number
  settings: DiagnosticSettings
  rawGroupCount: number
  rawGroups: RawGroup[]
  /** Null when there are fewer than two raw groups. */
  centroidDistances: DistanceSummary | null
  finalSingerCount: number
  singers: FinalSinger[]
}

/** The group of each embedding after each step of the clustering and the join of short singers. */
export type GroupStages = {
  /** After the threshold merge: the raw groups. */
  merged: readonly number[]
  /** After the join of small groups. */
  joinedSmall: readonly number[]
  /** After the cap at the highest count of singers. */
  capped: readonly number[]
  /** After the join of short singers. */
  folded: readonly number[]
}

/** Returns the reason of the first step at which the embedding shares its group with another raw group. */
function joinReason(stages: GroupStages, member: number, foldReason: JoinReason): JoinReason {
  const together = (stage: readonly number[]) =>
    stages.merged.some(
      (group, index) => group !== stages.merged[member] && stage[index] === stage[member],
    )
  if (together(stages.joinedSmall)) return 'small-group'
  if (together(stages.capped)) return 'cap'
  return foldReason
}

/**
 * Returns what happened to each raw group.
 * In each final group, the raw group with the most sung time stays, and each other raw group joins it.
 * @param stages The group of each embedding after each step.
 * @param rawSungMs The sung time of each raw group, at the index of its number.
 * @param singerOf Returns the singer number of a final group, or undefined for a group with no range.
 * @param foldReason The reason of a join of short singers: the limit of the share or the limit of the time.
 */
export function groupFates(
  stages: GroupStages,
  rawSungMs: readonly number[],
  singerOf: (folded: number) => number | undefined,
  foldReason: 'share' | 'time',
): RawGroup[] {
  const firstMember = rawSungMs.map((_, group) => stages.merged.indexOf(group))
  const leaders = new Map<number, number>()
  rawSungMs.forEach((sungMs, group) => {
    const folded = stages.folded[firstMember[group] ?? -1] ?? -1
    const leader = leaders.get(folded)
    if (leader === undefined || sungMs > (rawSungMs[leader] ?? 0)) leaders.set(folded, group)
  })
  return rawSungMs.map((sungMs, group) => {
    const member = firstMember[group] ?? -1
    const folded = stages.folded[member] ?? -1
    const leader = leaders.get(folded) ?? group
    const fate: GroupFate =
      leader === group
        ? { kind: 'kept', singer: singerOf(folded) ?? null }
        : { kind: 'joined', into: leader, reason: joinReason(stages, member, foldReason) }
    return {
      group,
      sungMs: Math.round(sungMs),
      embeddingCount: stages.merged.filter((owner) => owner === group).length,
      fate,
    }
  })
}

/** Returns the sung time and the count of ranges of each singer of the result, in the order of the singer numbers. */
export function finalSingers(
  segments: readonly { startMs: number; endMs: number; singer: number }[],
): FinalSinger[] {
  const singers = new Map<number, FinalSinger>()
  for (const { startMs, endMs, singer } of segments) {
    const entry = singers.get(singer) ?? { singer, sungMs: 0, rangeCount: 0 }
    entry.sungMs += endMs - startMs
    entry.rangeCount += 1
    singers.set(singer, entry)
  }
  return [...singers.values()].sort((a, b) => a.singer - b.singer)
}

/** Returns a distance rounded to three decimals, which is enough to compare it with the threshold. */
function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Returns the smallest, the median and the largest distance, or null for no distance. */
export function distanceSummary(distances: readonly number[]): DistanceSummary | null {
  if (distances.length === 0) return null
  const sorted = distances.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
  return {
    min: rounded(sorted[0] ?? 0),
    median: rounded(median),
    max: rounded(sorted.at(-1) ?? 0),
  }
}

/** Returns the text of a join reason for the report, with the limit in force. */
export function joinReasonText(reason: JoinReason, settings: DiagnosticSettings): string {
  switch (reason) {
    case 'small-group':
      return `fewer than ${settings.minGroupSize} embeddings`
    case 'cap':
      return 'over the highest count'
    case 'share':
      return `under ${Math.round(settings.minSingerShare * 100)}% of the sung time`
    case 'time':
      return `under ${settings.minSingerMs / 1000} seconds`
  }
}
