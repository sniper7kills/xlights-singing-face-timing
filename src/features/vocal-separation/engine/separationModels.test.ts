import { describe, expect, it } from 'vitest'
import { DEMUCS_MODEL_FILES } from './demucsModel.ts'
import {
  DEFAULT_SEPARATION_MODEL,
  isSeparationModelId,
  SEPARATION_MODELS,
  separationModelMb,
} from './separationModels.ts'

describe('SEPARATION_MODELS', () => {
  it('lists Spleeter first as the default, then Demucs', () => {
    expect(SEPARATION_MODELS.map((model) => model.id)).toEqual(['spleeter', 'demucs'])
    expect(DEFAULT_SEPARATION_MODEL).toBe('spleeter')
  })

  it('gives the download size of each model in whole megabytes', () => {
    expect(separationModelMb('spleeter')).toBe(79)
    expect(separationModelMb('demucs')).toBe(181)
  })

  it('pins the Demucs file to a commit, with its size and SHA-256', () => {
    expect(DEMUCS_MODEL_FILES).toEqual([
      {
        url: 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx',
        bytes: 180_534_758,
        sha256: 'e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077',
      },
    ])
  })
})

describe('isSeparationModelId', () => {
  it.each([
    ['spleeter', true],
    ['demucs', true],
    ['open-unmix', false],
    [undefined, false],
  ])('gives %s for %s', (value, expected) => {
    expect(isSeparationModelId(value)).toBe(expected)
  })
})
