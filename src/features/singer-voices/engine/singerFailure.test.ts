import { describe, expect, it } from 'vitest'
import { loadFailure, runFailure, SingerFailure } from './singerFailure.ts'

describe('loadFailure', () => {
  it('gives download for a network error of fetch', () => {
    expect(loadFailure(new TypeError('Failed to fetch')).kind).toBe('download')
  })

  it('gives download for an HTTP error of the library', () => {
    const error = new Error('Could not locate file: "https://huggingface.co/x/onnx/model.onnx".')
    expect(loadFailure(error).kind).toBe('download')
  })

  it('gives memory for a failed allocation of the runtime', () => {
    expect(loadFailure(new Error('std::bad_alloc')).kind).toBe('memory')
  })

  it('gives model for any other error', () => {
    const failure = loadFailure(new Error('Unsupported model type'))
    expect(failure).toBeInstanceOf(SingerFailure)
    expect(failure.kind).toBe('model')
    expect(failure.message).toContain('Unsupported model type')
  })
})

describe('runFailure', () => {
  it('gives memory for a RangeError', () => {
    expect(runFailure(new RangeError('Array buffer allocation failed')).kind).toBe('memory')
  })

  it('gives model for any other error', () => {
    expect(runFailure(new Error('The model gave no float32 output')).kind).toBe('model')
  })
})
