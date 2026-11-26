import { describe, expect, it } from 'vitest'
import { SPLIT_MODELS, splitModelMb, splitModelUrl } from './splitModels.ts'

describe('SPLIT_MODELS', () => {
  it('gives the stems of the contract in output order for each mode', () => {
    expect(SPLIT_MODELS['male-female'].stems).toEqual(['male', 'female'])
    expect(SPLIT_MODELS['lead-backing'].stems).toEqual(['lead', 'backing'])
  })

  it('gives frames of chunk / 441 + 1 for each mode', () => {
    for (const model of Object.values(SPLIT_MODELS))
      expect(model.frames).toBe(model.chunkSamples / 441 + 1)
  })
})

describe('splitModelMb', () => {
  it('gives 267 MB for male and female and 864 MB for lead and backing', () => {
    expect(splitModelMb('male-female')).toBe(267)
    expect(splitModelMb('lead-backing')).toBe(864)
  })
})

describe('splitModelUrl', () => {
  it('gives an absolute URL under the base of the app', () => {
    expect(splitModelUrl('a.onnx', 'https://app.test', '/')).toBe('https://app.test/models/a.onnx')
    expect(splitModelUrl('a.onnx', 'https://app.test', '/sub/')).toBe(
      'https://app.test/sub/models/a.onnx',
    )
  })
})
