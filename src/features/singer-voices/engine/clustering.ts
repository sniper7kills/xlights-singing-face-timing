/** The settings of the clustering. */
export interface ClusterSettings {
  /** Two groups merge while the distance between their centroids is not more than this value. */
  threshold: number
  /** A group with fewer embeddings than this joins the closest larger group, if one exists. */
  minGroupSize: number
  /** The clustering merges more groups until no more than this count remains. */
  maxGroups: number
}

interface Group {
  /** The sum of the unit-length embeddings of the group. */
  sum: Float64Array
  /** The embeddings of the group, as indexes. */
  members: number[]
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

/**
 * Returns the group of each embedding, numbered 0, 1, 2… in the order of the first embedding of each group.
 * The clustering follows the `AgglomerativeClustering` of pyannote.audio with the `centroid` method:
 * - It scales each embedding to unit length and merges the two groups with the closest centroids, while that distance is not more than the threshold.
 * - Then each group smaller than `minGroupSize` joins the closest group that is not small.
 * - Then the closest groups merge until no more than `maxGroups` remain.
 *
 * An embedding with a value that is not finite gets `NO_GROUP`, and the other embeddings get the groups that they get without it.
 * @param embeddings The speaker embeddings, in the order of their time.
 * @param settings The threshold, the small group size and the highest count of groups.
 */
export function clusterEmbeddings(
  embeddings: readonly Float32Array[],
  settings: ClusterSettings,
): number[] {
  const groups: Group[] = embeddings.flatMap((embedding, index) =>
    embedding.every(Number.isFinite) ? [{ sum: unitLength(embedding), members: [index] }] : [],
  )
  // pyannote.audio lowers the small group size for a short input in the same way.
  const minSize = Math.min(settings.minGroupSize, Math.max(1, Math.round(groups.length / 10)))
  mergeClosest(groups, (distance) => distance <= settings.threshold)
  joinSmallGroups(groups, minSize)
  mergeClosest(groups, () => groups.length > settings.maxGroups)
  return groupNumbers(groups, embeddings.length)
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
  const groups: Group[] = groupTimes.map(() => ({ sum: new Float64Array(0), members: [] }))
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
