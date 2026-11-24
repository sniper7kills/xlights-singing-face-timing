import { describe, expect, it } from 'vitest'
import { MAX_WASM_THREADS, wasmThreads } from './threads.ts'

describe('wasmThreads', () => {
  it('returns undefined for a page that is not cross-origin isolated', () => {
    expect(wasmThreads(false, 12)).toBeUndefined()
  })

  it('returns the core count when it is below the limit', () => {
    expect(wasmThreads(true, 2)).toBe(2)
  })

  it('returns the limit for a processor with more cores', () => {
    expect(wasmThreads(true, 12)).toBe(MAX_WASM_THREADS)
  })

  it('returns 1 when the browser reports no cores', () => {
    expect(wasmThreads(true, 0)).toBe(1)
  })
})
