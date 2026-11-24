import { describe, expect, it } from 'vitest'
import { chooseDevice } from './device.ts'

describe('chooseDevice', () => {
  it('returns webgpu when the browser gives an adapter', async () => {
    await expect(chooseDevice({ requestAdapter: () => Promise.resolve({}) })).resolves.toBe(
      'webgpu',
    )
  })

  it('returns wasm when the browser has no WebGPU', async () => {
    await expect(chooseDevice(undefined)).resolves.toBe('wasm')
  })

  it('returns wasm when the browser gives no adapter', async () => {
    await expect(chooseDevice({ requestAdapter: () => Promise.resolve(null) })).resolves.toBe(
      'wasm',
    )
  })

  it('returns wasm when the adapter request fails', async () => {
    await expect(
      chooseDevice({ requestAdapter: () => Promise.reject(new Error('blocked')) }),
    ).resolves.toBe('wasm')
  })

  it('returns wasm in a browser with no navigator.gpu', async () => {
    await expect(chooseDevice()).resolves.toBe('wasm')
  })
})
