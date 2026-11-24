import { describe, expect, it } from 'vitest'
import { hasWebGpu, pickDevice, withSpeed } from './device.ts'

describe('hasWebGpu', () => {
  it('returns true when the browser gives an adapter', async () => {
    await expect(hasWebGpu({ requestAdapter: () => Promise.resolve({}) })).resolves.toBe(true)
  })

  it('returns false when the browser has no WebGPU', async () => {
    await expect(hasWebGpu(undefined)).resolves.toBe(false)
  })

  it('returns false when the browser gives no adapter', async () => {
    await expect(hasWebGpu({ requestAdapter: () => Promise.resolve(null) })).resolves.toBe(false)
  })

  it('returns false when the adapter request fails', async () => {
    await expect(
      hasWebGpu({ requestAdapter: () => Promise.reject(new Error('blocked')) }),
    ).resolves.toBe(false)
  })

  it('returns false in a browser with no navigator.gpu', async () => {
    await expect(hasWebGpu()).resolves.toBe(false)
  })
})

describe('pickDevice', () => {
  it('returns wasm when the browser has no WebGPU adapter', () => {
    expect(pickDevice(false, { wasm: 1, webgpu: 9 })).toBe('wasm')
  })

  it('returns wasm first when no speed is stored', () => {
    expect(pickDevice(true, undefined)).toBe('wasm')
    expect(pickDevice(true, { webgpu: 9 })).toBe('wasm')
  })

  it('returns webgpu once when only the wasm speed is stored', () => {
    expect(pickDevice(true, { wasm: 3 })).toBe('webgpu')
  })

  it('returns the faster device when both speeds are stored', () => {
    expect(pickDevice(true, { wasm: 3, webgpu: 0.8 })).toBe('wasm')
    expect(pickDevice(true, { wasm: 3, webgpu: 12 })).toBe('webgpu')
  })

  it('returns wasm for a WebGPU device that failed', () => {
    expect(pickDevice(true, { wasm: 0.5, webgpu: 0 })).toBe('wasm')
  })
})

describe('withSpeed', () => {
  it('adds the speed of one device and keeps the other values', () => {
    const all = { 'whisper-tiny': { wasm: 4 }, 'whisper-base': { wasm: 2 } }

    expect(withSpeed(all, 'whisper-tiny', 'webgpu', 1)).toEqual({
      'whisper-tiny': { wasm: 4, webgpu: 1 },
      'whisper-base': { wasm: 2 },
    })
    expect(all['whisper-tiny']).toEqual({ wasm: 4 })
  })

  it('adds the first speed of a speech model', () => {
    expect(withSpeed({}, 'whisper-base', 'wasm', 2.5)).toEqual({ 'whisper-base': { wasm: 2.5 } })
  })
})
