import { describe, expect, it } from 'vitest'
import { clusterStages, foldShortGroups, groupSingers, NO_GROUP } from './clustering.ts'

const vector = (...values: number[]) => Float32Array.from(values)
const settings = { threshold: 0.5, minGroupSize: 1, maxGroups: 12, minShare: 0.05 }
const SPEECH = { threshold: 0.7045654963945799, minGroupSize: 12, maxGroups: 12, minShare: 0.05 }
const ones = (count: number) => Array<number>(count).fill(1)

/**
 * Returns an embedding with the value `noise` on an axis of its own, so that each pair of embeddings has an exact distance.
 * @param center The values of the first two axes.
 */
function spread(center: [number, number], noise: number, axis: number): Float32Array {
  const values = new Float32Array(50)
  values.set(center)
  values[2 + axis] = noise
  return values
}

/**
 * Returns embeddings with the distances that the song of issue #137 gave, in the order of the song: solo, chorus, solo, chorus …
 * - 19 solo embeddings 0.63 apart, so they merge under the speech threshold.
 * - 25 chorus embeddings of short parts, 1.03 apart, so no two of them merge under it.
 * - The two centroids are 0.77 apart. The song gave 0.764.
 */
function soloAndChorus(): { embeddings: Float32Array[]; chorus: boolean[] } {
  const embeddings: Float32Array[] = []
  const chorus: boolean[] = []
  for (let index = 0; index < 25; index++) {
    if (index < 19) {
      embeddings.push(spread([1, 0], 0.5, index))
      chorus.push(false)
    }
    embeddings.push(spread([0.7, 1], 1.3, 19 + index))
    chorus.push(true)
  }
  return { embeddings, chorus }
}

describe('groupSingers', () => {
  it('gives one group to embeddings that point the same way, whatever their length', () => {
    expect(groupSingers([vector(1, 0), vector(5, 0.1), vector(0.2, 0)], ones(3), settings)).toEqual(
      [0, 0, 0],
    )
  })

  it('gives two groups to two directions that are far apart', () => {
    const embeddings = [vector(1, 0), vector(0, 1), vector(1, 0.1), vector(0.1, 1)]
    expect(groupSingers(embeddings, ones(4), settings)).toEqual([0, 1, 0, 1])
  })

  it('numbers the groups in the order of their first embedding', () => {
    const embeddings = [vector(0, 1), vector(1, 0), vector(0, 1)]
    expect(groupSingers(embeddings, ones(3), settings)).toEqual([0, 1, 0])
  })

  it('keeps a chorus of short, scattered parts apart from a solo voice with the speech threshold', () => {
    const { embeddings, chorus } = soloAndChorus()
    const groups = groupSingers(embeddings, ones(embeddings.length), SPEECH)
    expect(groups).toEqual(chorus.map((isChorus) => (isChorus ? 1 : 0)))
  })

  it('gives one group to one voice when two groups of it are not farther apart than the threshold', () => {
    const embeddings = Array.from({ length: 30 }, (_, index) => spread([1, 0], 0.5, index))
    expect(new Set(groupSingers(embeddings, ones(30), SPEECH)).size).toBe(1)
  })

  it('gives one group when the second group holds less than the share of the weight', () => {
    const embeddings = [...Array.from({ length: 20 }, () => vector(1, 0)), vector(0, 1)]
    const weights = [...ones(20), 1]
    expect(new Set(groupSingers(embeddings, weights, { ...settings, minShare: 0.1 })).size).toBe(1)
    expect(new Set(groupSingers(embeddings, weights, { ...settings, minShare: 0.01 })).size).toBe(2)
  })

  it('keeps no more groups than the highest count', () => {
    const embeddings = [vector(1, 0, 0), vector(0, 1, 0), vector(0, 0, 1)]
    expect(new Set(groupSingers(embeddings, ones(3), { ...settings, maxGroups: 2 })).size).toBe(2)
  })

  it('gives the count of groups that the person gives, whatever the threshold', () => {
    const embeddings = Array.from({ length: 30 }, (_, index) => spread([1, 0], 0.5, index))
    expect(new Set(groupSingers(embeddings, ones(30), SPEECH, 2)).size).toBe(2)
    expect(new Set(groupSingers([vector(1, 0), vector(0, 1)], ones(2), settings, 1)).size).toBe(1)
  })

  it('puts a chorus on one group of its own for a count of 2', () => {
    const { embeddings, chorus } = soloAndChorus()
    const groups = groupSingers(embeddings, ones(embeddings.length), SPEECH, 2)
    expect(groups).toEqual(chorus.map((isChorus) => (isChorus ? 1 : 0)))
  })

  it('joins a stray embedding into the closest large group for a count, so it is not a singer of its own', () => {
    const many = Array.from({ length: 10 }, (_, index) => vector(1, index / 100, 0))
    const others = Array.from({ length: 10 }, (_, index) => vector(0, index / 100, 1))
    const stray = vector(0.6, 0.8, 0)
    const groups = groupSingers([...many, ...others, stray], ones(21), settings, 2)
    expect(new Set(groups).size).toBe(2)
    expect(groups.at(-1)).toBe(0)
  })

  it('gives an empty list for no embeddings', () => {
    expect(groupSingers([], [], settings)).toEqual([])
    expect(groupSingers([], [], settings, 2)).toEqual([])
  })

  it('gives no group to each of 13 NaN embeddings, and returns at once', () => {
    const embeddings = Array.from({ length: 13 }, () => vector(Number.NaN, Number.NaN))
    expect(groupSingers(embeddings, ones(13), settings)).toEqual(Array<number>(13).fill(NO_GROUP))
  })

  it('gives the good embeddings the same groups with or without NaN embeddings among them', () => {
    const [east, north, nearEast, nearNorth] = [
      vector(1, 0),
      vector(0, 1),
      vector(1, 0.1),
      vector(0.1, 1),
    ]
    const nan = vector(Number.NaN, 0)
    const groups = groupSingers(
      [nan, east, nan, north, nearEast, nan, nearNorth],
      ones(7),
      settings,
    )
    expect(groups.filter((group) => group !== NO_GROUP)).toEqual(
      groupSingers([east, north, nearEast, nearNorth], ones(4), settings),
    )
    expect([groups[0], groups[2], groups[5]]).toEqual([NO_GROUP, NO_GROUP, NO_GROUP])
  })

  it('counts an Infinity value as not finite', () => {
    const embeddings = [vector(1, 0), vector(Number.POSITIVE_INFINITY, 0), vector(1, 0)]
    expect(groupSingers(embeddings, ones(3), settings)).toEqual([0, NO_GROUP, 0])
  })

  it('treats a zero embedding as far from every direction', () => {
    expect(groupSingers([vector(0, 0), vector(1, 0)], ones(2), settings)).toEqual([0, 1])
  })
})

describe('foldShortGroups', () => {
  const east = vector(1, 0)
  const north = vector(0, 1)
  const northEast = vector(0.9, 0.3)

  it('joins a group with less time than the limit into the remaining group with the closest centroid', () => {
    const groups = foldShortGroups([0, 1, 2], [east, north, northEast], [10_000, 10_000, 500], 3000)
    expect(groups).toEqual([0, 1, 0])
  })

  it('keeps every group that reaches the limit', () => {
    expect(foldShortGroups([0, 1], [east, north], [3000, 3000], 3000)).toEqual([0, 1])
  })

  it('keeps the group with the most time when all groups are short', () => {
    expect(foldShortGroups([0, 1, 2], [east, north, northEast], [100, 900, 200], 3000)).toEqual([
      0, 0, 0,
    ])
  })

  it('numbers the remaining groups again in the order of their first embedding', () => {
    const groups = foldShortGroups([0, 1, 2], [northEast, east, north], [500, 10_000, 10_000], 3000)
    expect(groups).toEqual([0, 0, 1])
  })

  it('gives an empty list for no embeddings', () => {
    expect(foldShortGroups([], [], [], 3000)).toEqual([])
  })
})

describe('clusterStages', () => {
  const many = Array.from({ length: 10 }, (_, index) => vector(1, index / 100, 0))
  const others = Array.from({ length: 10 }, (_, index) => vector(0, index / 100, 1))
  const stray = vector(0.6, 0.8, 0)
  const embeddings = [...many, ...others, stray]
  const small = { threshold: 0.3, minGroupSize: 2, maxGroups: 12, minShare: 0.05 }
  const weights = ones(embeddings.length)

  it('gives the groups of the selected merge round before the join of small groups', () => {
    // For a count of 3, the round with 3 large groups splits the second direction, and the stray embedding is a small group.
    const { merged, joinedSmall } = clusterStages(embeddings, weights, small, 3)
    expect(new Set(merged).size).toBe(4)
    expect(merged.at(-1)).toBe(3)
    expect(joinedSmall.at(-1)).toBe(0)
  })

  it('joins the small group into a larger group after the join of small groups', () => {
    const { joinedSmall } = clusterStages(embeddings, weights, small)
    expect(new Set(joinedSmall).size).toBe(2)
    expect(joinedSmall.at(-1)).toBe(0)
  })

  it('gives the result of groupSingers as the capped groups', () => {
    const three = [vector(1, 0, 0), vector(0, 1, 0), vector(0, 0, 1)]
    const capped = { ...settings, maxGroups: 2 }
    expect(clusterStages(three, ones(3), capped).capped).toEqual(
      groupSingers(three, ones(3), capped),
    )
    expect(clusterStages(embeddings, weights, small, 2).capped).toEqual(
      groupSingers(embeddings, weights, small, 2),
    )
  })

  it('gives one distance for each pair of merged groups', () => {
    expect(clusterStages(embeddings, weights, small, 3).mergedDistances).toHaveLength(6)
    expect(
      clusterStages([vector(1, 0), vector(1, 0.1)], ones(2), settings).mergedDistances,
    ).toEqual([])
  })

  it('lowers the small group size for a short input', () => {
    const short = [vector(1, 0), vector(0, 1)]
    expect(clusterStages(short, ones(2), { ...settings, minGroupSize: 12 }).minGroupSize).toBe(1)
    expect(clusterStages(embeddings, weights, small).minGroupSize).toBe(2)
  })
})
