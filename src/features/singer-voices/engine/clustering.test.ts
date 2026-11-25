import { describe, expect, it } from 'vitest'
import { clusterEmbeddings, clusterStages, foldShortGroups, NO_GROUP } from './clustering.ts'

const vector = (...values: number[]) => Float32Array.from(values)
const settings = { threshold: 0.5, minGroupSize: 1, maxGroups: 12 }

describe('clusterEmbeddings', () => {
  it('gives one group to embeddings that point the same way, whatever their length', () => {
    expect(clusterEmbeddings([vector(1, 0), vector(5, 0.1), vector(0.2, 0)], settings)).toEqual([
      0, 0, 0,
    ])
  })

  it('gives two groups to two directions that are far apart', () => {
    const embeddings = [vector(1, 0), vector(0, 1), vector(1, 0.1), vector(0.1, 1)]
    expect(clusterEmbeddings(embeddings, settings)).toEqual([0, 1, 0, 1])
  })

  it('numbers the groups in the order of their first embedding', () => {
    const embeddings = [vector(0, 1), vector(1, 0), vector(0, 1)]
    expect(clusterEmbeddings(embeddings, settings)).toEqual([0, 1, 0])
  })

  it('merges groups past the threshold until no more than the highest count remains', () => {
    const embeddings = [vector(1, 0, 0), vector(0, 1, 0), vector(0, 0, 1)]
    expect(new Set(clusterEmbeddings(embeddings, { ...settings, maxGroups: 2 })).size).toBe(2)
  })

  it('joins a group smaller than the small group size into the closest larger group', () => {
    const many = Array.from({ length: 10 }, (_, index) => vector(1, index / 100, 0))
    const others = Array.from({ length: 10 }, (_, index) => vector(0, index / 100, 1))
    const stray = vector(0.6, 0.8, 0)
    const groups = clusterEmbeddings([...many, ...others, stray], {
      threshold: 0.3,
      minGroupSize: 2,
      maxGroups: 12,
    })
    expect(new Set(groups).size).toBe(2)
    expect(groups.at(-1)).toBe(0)
  })

  it('keeps small groups when no group is large enough', () => {
    const embeddings = [vector(1, 0), vector(0, 1)]
    expect(clusterEmbeddings(embeddings, { ...settings, minGroupSize: 12 })).toEqual([0, 1])
  })

  it('gives an empty list for no embeddings', () => {
    expect(clusterEmbeddings([], settings)).toEqual([])
  })

  it('gives no group to each of 13 NaN embeddings, and returns at once', () => {
    const embeddings = Array.from({ length: 13 }, () => vector(Number.NaN, Number.NaN))
    expect(clusterEmbeddings(embeddings, settings)).toEqual(Array<number>(13).fill(NO_GROUP))
  })

  it('gives the good embeddings the same groups with or without NaN embeddings among them', () => {
    const [east, north, nearEast, nearNorth] = [
      vector(1, 0),
      vector(0, 1),
      vector(1, 0.1),
      vector(0.1, 1),
    ]
    const nan = vector(Number.NaN, 0)
    const groups = clusterEmbeddings([nan, east, nan, north, nearEast, nan, nearNorth], settings)
    expect(groups.filter((group) => group !== NO_GROUP)).toEqual(
      clusterEmbeddings([east, north, nearEast, nearNorth], settings),
    )
    expect([groups[0], groups[2], groups[5]]).toEqual([NO_GROUP, NO_GROUP, NO_GROUP])
  })

  it('counts an Infinity value as not finite', () => {
    const embeddings = [vector(1, 0), vector(Number.POSITIVE_INFINITY, 0), vector(1, 0)]
    expect(clusterEmbeddings(embeddings, settings)).toEqual([0, NO_GROUP, 0])
  })

  it('treats a zero embedding as far from every direction', () => {
    expect(clusterEmbeddings([vector(0, 0), vector(1, 0)], settings)).toEqual([0, 1])
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
  const small = { threshold: 0.3, minGroupSize: 2, maxGroups: 12 }

  it('gives three raw groups after the threshold merge', () => {
    const { merged } = clusterStages(embeddings, small)
    expect(new Set(merged).size).toBe(3)
    expect(merged.at(-1)).toBe(2)
  })

  it('joins the small group into a larger group after the join of small groups', () => {
    const { joinedSmall } = clusterStages(embeddings, small)
    expect(new Set(joinedSmall).size).toBe(2)
    expect(joinedSmall.at(-1)).toBe(0)
  })

  it('gives the result of clusterEmbeddings as the capped groups', () => {
    const three = [vector(1, 0, 0), vector(0, 1, 0), vector(0, 0, 1)]
    const capped = { ...settings, maxGroups: 2 }
    expect(clusterStages(three, capped).capped).toEqual(clusterEmbeddings(three, capped))
    expect(clusterStages(embeddings, small).capped).toEqual(clusterEmbeddings(embeddings, small))
  })

  it('gives one distance for each pair of merged groups', () => {
    expect(clusterStages(embeddings, small).mergedDistances).toHaveLength(3)
    expect(clusterStages([vector(1, 0), vector(1, 0.1)], settings).mergedDistances).toEqual([])
  })

  it('lowers the small group size for a short input', () => {
    const short = [vector(1, 0), vector(0, 1)]
    expect(clusterStages(short, { ...settings, minGroupSize: 12 }).minGroupSize).toBe(1)
    expect(clusterStages(embeddings, small).minGroupSize).toBe(2)
  })
})
