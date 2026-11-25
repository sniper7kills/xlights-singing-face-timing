/** The settings of `groupSingers`. */
export interface SingerGroupSettings {
  /** With no count, two singers are different only when the distance between their centroids is more than this value. */
  threshold: number
  /** A group with fewer embeddings than this joins the closest larger group, if one exists. */
  minGroupSize: number
  /** With no count, the result has no more than this count of singers. */
  maxGroups: number
  /** With no count, each singer holds at least this share of the weight of all embeddings. */
  minShare: number
}

interface Group {
  /** The sum of the unit-length embeddings of the group. */
  sum: Float64Array
  /** The embeddings of the group, as indexes. */
  members: number[]
  /** The sum of the weights of the embeddings of the group. */
  weight: number
}

function unitLength(embedding: Float32Array): Float64Array {
  const norm = Math.hypot(...embedding)
  return Float64Array.from(embedding, (value) => (norm === 0 ? 0 : value / norm))
}

function centroidDistance(a: Group, b: Group): number {
  let sum = 0
  for (let index = 0; index < a.sum.length; index++) {
    const difference =
      (a.sum[index] ?? 0) / a.members.length - (b.sum[index] ?? 0) / b.members.length
    sum += difference * difference
  }
  return Math.sqrt(sum)
}

function closestPair(
  groups: readonly Group[],
  canJoin: (a: Group, b: Group) => boolean,
): { a: number; b: number; distance: number } {
  let best = { a: -1, b: -1, distance: Infinity }
  groups.forEach((a, i) =>
    groups.forEach((b, j) => {
      if (j <= i || !canJoin(a, b)) return
      const distance = centroidDistance(a, b)
      if (distance < best.distance) best = { a: i, b: j, distance }
    }),
  )
  return best
}

function join(groups: Group[], a: number, b: number): void {
  const target = groups[a]
  const source = groups[b]
  if (target === undefined || source === undefined) return
  target.sum = target.sum.map((value, index) => value + (source.sum[index] ?? 0))
  target.members.push(...source.members)
  target.weight += source.weight
  groups.splice(b, 1)
}

/** The group of an embedding that holds NaN or Infinity. Such an embedding has no distance to another embedding. */
export const NO_GROUP = -1

/**
 * Joins the closest two groups while a pair exists and `more` is true for their distance.
 * Each join removes one group, so the loop ends after fewer rounds than the start count of groups, whatever the input.
 */
function mergeClosest(groups: Group[], more: (distance: number) => boolean): void {
  for (let round = groups.length; round > 0; round--) {
    const pair = closestPair(groups, () => true)
    if (pair.a < 0 || !more(pair.distance)) return
    join(groups, pair.a, pair.b)
  }
}

/** Joins each group smaller than `minSize` into the closest group that is not small, while such a pair exists. */
function joinSmallGroups(groups: Group[], minSize: number): void {
  const isSmall = (group: Group) => group.members.length < minSize
  for (let round = groups.length; round > 0; round--) {
    const pair = closestPair(groups, (a, b) => isSmall(a) !== isSmall(b))
    if (pair.a < 0) return
    const first = groups[pair.a]
    if (first !== undefined && isSmall(first)) join(groups, pair.b, pair.a)
    else join(groups, pair.a, pair.b)
  }
}

function copyGroups(groups: readonly Group[]): Group[] {
  return groups.map((group) => ({ ...group, sum: group.sum.slice(), members: [...group.members] }))
}

function countLarge(groups: readonly Group[], minSize: number): number {
  return groups.filter((group) => group.members.length >= minSize).length
}

/** The joins of one merge down to one group, and the count of large groups before the first join and after each join. */
interface MergeHistory {
  joins: [number, number][]
  large: number[]
  /** The small group size of the large counts. */
  minSize: number
}

/** Merges the closest centroids until one group remains, and records each join. The start groups do not change. */
function mergeHistory(start: readonly Group[], minSize: number): MergeHistory {
  const groups = copyGroups(start)
  const history: MergeHistory = { joins: [], large: [countLarge(groups, minSize)], minSize }
  for (let round = groups.length; round > 1; round--) {
    const pair = closestPair(groups, () => true)
    if (pair.a < 0) break
    join(groups, pair.a, pair.b)
    history.joins.push([pair.a, pair.b])
    history.large.push(countLarge(groups, minSize))
  }
  return history
}

/** The groups of one cut, after each step. The numbers are the group of each embedding, as `groupNumbers` gives them. */
interface Cut {
  merged: number[]
  mergedDistances: number[]
  joinedSmall: number[]
  groups: Group[]
}

/** Returns the distance between the centroids of each pair of groups. */
function pairDistances(groups: readonly Group[]): number[] {
  return groups.flatMap((a, i) => groups.slice(i + 1).map((b) => centroidDistance(a, b)))
}

/**
 * Returns the groups at the merge round with a count of large groups closest to `count`, as pyannote.audio does for a known count.
 * A later round wins a tie. Then each small group joins the closest large group, and the closest groups merge down to `count`.
 * If no round has as many large groups as `count`, the result is the round with `count` groups, small or large.
 * @param total The count of all embeddings, with the embeddings that are not finite.
 */
function cutAtCount(
  start: readonly Group[],
  history: MergeHistory,
  count: number,
  total: number,
): Cut {
  const miss = (round: number) => Math.abs((history.large[round] ?? 0) - count)
  const best = history.large.reduce(
    (found, _, round) => (miss(round) <= miss(found) ? round : found),
    0,
  )
  const tooFew = (history.large[best] ?? 0) < count
  const rounds = tooFew ? Math.max(0, start.length - count) : best
  const groups = copyGroups(start)
  for (const [a, b] of history.joins.slice(0, rounds)) join(groups, a, b)
  const merged = groupNumbers(groups, total)
  const mergedDistances = pairDistances(groups)
  if (tooFew) return { merged, mergedDistances, joinedSmall: merged, groups }
  joinSmallGroups(groups, history.minSize)
  const joinedSmall = groupNumbers(groups, total)
  mergeClosest(groups, () => groups.length > count)
  return { merged, mergedDistances, joinedSmall, groups }
}

/** Returns true when each group holds `minShare` of the weight or more, and each pair of centroids is farther apart than `threshold`. */
function separated(groups: readonly Group[], settings: SingerGroupSettings): boolean {
  const total = groups.reduce((sum, group) => sum + group.weight, 0)
  if (groups.some((group) => group.weight < settings.minShare * total)) return false
  return groups.every((a, i) =>
    groups.every((b, j) => j <= i || centroidDistance(a, b) > settings.threshold),
  )
}

/** The group of each embedding after each step of `groupSingers`, for the singer diagnostics. */
export type ClusterStages = {
  /** The groups of the selected merge round, before the join of small groups. */
  merged: number[]
  /** After the join of small groups. */
  joinedSmall: number[]
  /** After the merge down to the count: the result of `groupSingers`. */
  capped: number[]
  /** The distance between the centroids of each pair of groups of the selected merge round. */
  mergedDistances: number[]
  /** The small group size in force. It is lower than `minGroupSize` for a short input. */
  minGroupSize: number
}

/**
 * Returns the group of each embedding after each step of `groupSingers`.
 * @param embeddings The speaker embeddings, in the order of their time.
 * @param weights The weight of each embedding, for example its samples.
 * @param settings The threshold, the small group size, the highest count of groups and the share of a singer.
 * @param count The count of singers that the person gives. With a count, the threshold and the share do not apply.
 */
export function clusterStages(
  embeddings: readonly Float32Array[],
  weights: readonly number[],
  settings: SingerGroupSettings,
  count?: number,
): ClusterStages {
  const start: Group[] = embeddings.flatMap((embedding, index) =>
    embedding.every(Number.isFinite)
      ? [{ sum: unitLength(embedding), members: [index], weight: weights[index] ?? 0 }]
      : [],
  )
  // pyannote.audio lowers the small group size for a short input in the same way.
  const minSize = Math.min(settings.minGroupSize, Math.max(1, Math.round(start.length / 10)))
  const history = mergeHistory(start, minSize)
  const cut = (groupCount: number) => cutAtCount(start, history, groupCount, embeddings.length)
  const best = count === undefined ? automaticCut(cut, settings) : cut(count)
  const capped = groupNumbers(best.groups, embeddings.length)
  return { ...best, capped, minGroupSize: minSize }
}

/** Returns the cut with the highest count, up to `maxGroups`, whose groups are `separated`, or the cut with one group. */
function automaticCut(cut: (groupCount: number) => Cut, settings: SingerGroupSettings): Cut {
  let best = cut(1)
  for (let groupCount = 2; groupCount <= settings.maxGroups; groupCount++) {
    const next = cut(groupCount)
    if (next.groups.length < groupCount || !separated(next.groups, settings)) break
    best = next
  }
  return best
}

/**
 * Returns the singer group of each embedding, numbered 0, 1, 2… in the order of the first embedding of each group.
 * The function scales each embedding to unit length and merges the two groups with the closest centroids, as the `centroid` method of pyannote.audio does.
 * For a count of singers, it cuts the merges where the count of large groups is closest to that count, as pyannote.audio does with `num_speakers`.
 * Each small group then joins the closest large group.
 * With no count, it takes the highest count, up to `maxGroups`, for which each singer holds `minShare` of the weight and the centroids are farther apart than `threshold`.
 * The threshold applies to the large groups and not to single embeddings, because the embeddings of short sung parts are far apart even for one voice.
 *
 * An embedding with a value that is not finite gets `NO_GROUP`, and the other embeddings get the groups that they get without it.
 * @param embeddings The speaker embeddings, in the order of their time.
 * @param weights The weight of each embedding, for example its samples.
 * @param settings The threshold, the small group size, the highest count of groups and the share of a singer.
 * @param count The count of singers that the person gives. With a count, the threshold and the share do not apply.
 */
export function groupSingers(
  embeddings: readonly Float32Array[],
  weights: readonly number[],
  settings: SingerGroupSettings,
  count?: number,
): number[] {
  return clusterStages(embeddings, weights, settings, count).capped
}

/** Returns the group of each embedding, with the groups numbered in the order of their first embedding. */
function groupNumbers(groups: readonly Group[], count: number): number[] {
  const owner = new Array<number>(count).fill(NO_GROUP)
  groups
    .map((group, index) => ({ first: Math.min(...group.members), index }))
    .sort((x, y) => x.first - y.first)
    .forEach(({ index }, number) => {
      for (const member of groups[index]?.members ?? []) owner[member] = number
    })
  return owner
}

/**
 * Returns the group of each embedding after each short group joins the remaining group with the closest centroid.
 * A group is short when its time is less than `minTime`. If all groups are short, the group with the most time remains.
 * The groups are numbered again in the order of their first embedding.
 * @param owners The group of each embedding, as `clusterEmbeddings` gives it.
 * @param embeddings The speaker embeddings, in the order of their time.
 * @param groupTimes The time of each group, at the index of its number.
 * @param minTime The time under which a group is short.
 */
export function foldShortGroups(
  owners: readonly number[],
  embeddings: readonly Float32Array[],
  groupTimes: readonly number[],
  minTime: number,
): number[] {
  const groups: Group[] = groupTimes.map(() => ({
    sum: new Float64Array(0),
    members: [],
    weight: 0,
  }))
  owners.forEach((owner, index) => {
    const group = groups[owner]
    const embedding = embeddings[index]
    if (group === undefined || embedding === undefined) return
    const unit = unitLength(embedding)
    group.sum = group.members.length === 0 ? unit : group.sum.map((v, i) => v + (unit[i] ?? 0))
    group.members.push(index)
  })
  const longest = groupTimes.indexOf(Math.max(...groupTimes))
  const remains = groupTimes.map((time, index) => time >= minTime || index === longest)
  const kept = groups.filter((group, index) => remains[index] && group.members.length > 0)
  if (kept.length === 0) return [...owners]
  groups.forEach((group, index) => {
    if (remains[index] || group.members.length === 0) return
    const target = kept.reduce((best, other) =>
      centroidDistance(group, other) < centroidDistance(group, best) ? other : best,
    )
    target.members.push(...group.members)
  })
  return groupNumbers(kept, owners.length)
}
