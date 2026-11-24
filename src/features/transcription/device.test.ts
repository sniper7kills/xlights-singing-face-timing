import { describe, expect, it } from 'vitest'
import {
  hasWebGpu,
  pickDevice,
  RETRY_FAILED_DEVICE_MS,
  withFailureTimes,
  withSpeed,
} from './device.ts'

/** A fixed `Date.now()` of the tests. */
const NOW = 1_800_000_000_000

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
    expect(pickDevice(false, { wasm: 1, webgpu: 9 }, NOW)).toBe('wasm')
  })

  it('returns wasm first when no speed is stored', () => {
    expect(pickDevice(true, undefined, NOW)).toBe('wasm')
    expect(pickDevice(true, { webgpu: 9 }, NOW)).toBe('wasm')
  })

  it('returns webgpu once when only the wasm speed is stored', () => {
    expect(pickDevice(true, { wasm: 3 }, NOW)).toBe('webgpu')
  })

  it('returns the faster device when both speeds are stored', () => {
    expect(pickDevice(true, { wasm: 3, webgpu: 0.8 }, NOW)).toBe('wasm')
    expect(pickDevice(true, { wasm: 3, webgpu: 12 }, NOW)).toBe('webgpu')
  })

  it('returns wasm for a WebGPU device that failed less than 7 days ago', () => {
    const failedAtMs = { webgpu: NOW - RETRY_FAILED_DEVICE_MS + 1 }

    expect(pickDevice(true, { wasm: 0.5, webgpu: 0, failedAtMs }, NOW)).toBe('wasm')
  })

  it('returns webgpu again for a WebGPU device that failed 7 days ago or earlier', () => {
    const failedAtMs = { webgpu: NOW - RETRY_FAILED_DEVICE_MS }

    expect(pickDevice(true, { wasm: 0.5, webgpu: 0, failedAtMs }, NOW)).toBe('webgpu')
  })

  it('counts a failed WebGPU device with no failure time as a failure now', () => {
    expect(pickDevice(true, { wasm: 0.5, webgpu: 0 }, NOW)).toBe('wasm')
  })
})

describe('withSpeed', () => {
  it('adds the speed of one device and keeps the other values', () => {
    const all = { 'whisper-tiny': { wasm: 4 }, 'whisper-base': { wasm: 2 } }

    expect(withSpeed(all, 'whisper-tiny', 'webgpu', 1, NOW)).toEqual({
      'whisper-tiny': { wasm: 4, webgpu: 1 },
      'whisper-base': { wasm: 2 },
    })
    expect(all['whisper-tiny']).toEqual({ wasm: 4 })
  })

  it('adds the first speed of a speech model', () => {
    expect(withSpeed({}, 'whisper-base', 'wasm', 2.5, NOW)).toEqual({
      'whisper-base': { wasm: 2.5 },
    })
  })

  it('records the failure time with the speed 0', () => {
    expect(withSpeed({ 'whisper-base': { wasm: 2 } }, 'whisper-base', 'webgpu', 0, NOW)).toEqual({
      'whisper-base': { wasm: 2, webgpu: 0, failedAtMs: { webgpu: NOW } },
    })
  })

  it('removes the failure time when the device runs again with a speed above 0', () => {
    const all = { 'whisper-base': { wasm: 2, webgpu: 0, failedAtMs: { webgpu: NOW - 9 } } }

    expect(withSpeed(all, 'whisper-base', 'webgpu', 5, NOW)).toEqual({
      'whisper-base': { wasm: 2, webgpu: 5 },
    })
  })
})

describe('withFailureTimes', () => {
  it('adds the current time to a failed WebGPU device of an earlier record', () => {
    const all = { 'whisper-base': { wasm: 2, webgpu: 0 }, 'whisper-tiny': { wasm: 4 } }

    expect(withFailureTimes(all, NOW)).toEqual({
      'whisper-base': { wasm: 2, webgpu: 0, failedAtMs: { webgpu: NOW } },
      'whisper-tiny': { wasm: 4 },
    })
  })

  it('returns the same record when no failure time is missing', () => {
    const all = { 'whisper-base': { wasm: 2, webgpu: 0, failedAtMs: { webgpu: NOW - 5 } } }

    expect(withFailureTimes(all, NOW)).toBe(all)
  })
})
