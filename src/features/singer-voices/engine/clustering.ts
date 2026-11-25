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

/**
 * Returns the group of each embedding, numbered 0, 1, 2… in the order of the first embedding of each group.
 * The clustering follows the `AgglomerativeClustering` of pyannote.audio with the `centroid` method:
 * - It scales each embedding to unit length and merges the two groups with the closest centroids, while that distance is not more than the threshold.
 * - Then each group smaller than `minGroupSize` joins the closest group that is not small.
 * - Then the closest groups merge until no more than `maxGroups` remain.
 * @param embeddings The speaker embeddings, in the order of their time.
 * @param settings The threshold, the small group size and the highest count of groups.
 */
export function clusterEmbeddings(
  embeddings: readonly Float32Array[],
  settings: ClusterSettings,
): number[] {
  const groups: Group[] = embeddings.map((embedding, index) => ({
    sum: unitLength(embedding),
    members: [index],
  }))
  for (;;) {
    const pair = closestPair(groups, () => true)
    if (pair.a < 0 || pair.distance > settings.threshold) break
    join(groups, pair.a, pair.b)
  }
  // pyannote.audio lowers the small group size for a short input in the same way.
  const minSize = Math.min(settings.minGroupSize, Math.max(1, Math.round(embeddings.length / 10)))
  const isSmall = (group: Group) => group.members.length < minSize
  for (;;) {
    const pair = closestPair(groups, (a, b) => isSmall(a) !== isSmall(b))
    if (pair.a < 0) break
    const first = groups[pair.a]
    if (first !== undefined && isSmall(first)) join(groups, pair.b, pair.a)
    else join(groups, pair.a, pair.b)
  }
  while (groups.length > settings.maxGroups) {
    const pair = closestPair(groups, () => true)
    join(groups, pair.a, pair.b)
  }
  const owner = new Array<number>(embeddings.length).fill(0)
  groups
    .map((group) => Math.min(...group.members))
    .map((first, index) => ({ first, index }))
    .sort((x, y) => x.first - y.first)
    .forEach(({ index }, number) => {
      for (const member of groups[index]?.members ?? []) owner[member] = number
    })
  return owner
}
