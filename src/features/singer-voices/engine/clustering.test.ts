import { describe, expect, it } from 'vitest'
import { clusterEmbeddings } from './clustering.ts'

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

  it('treats a zero embedding as far from every direction', () => {
    expect(clusterEmbeddings([vector(0, 0), vector(1, 0)], settings)).toEqual([0, 1])
  })
})
