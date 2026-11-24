import type { Device } from './protocol.ts'

/** The part of `navigator.gpu` that the device check reads. */
type GpuLike = { requestAdapter(): Promise<unknown> }

/**
 * Returns 'webgpu' when the browser gives a WebGPU adapter, else 'wasm'.
 * A browser can expose `navigator.gpu` and still return no adapter, for example with a blocked graphics driver.
 * @param gpu The WebGPU entry point of the browser. The default reads `navigator.gpu`.
 */
export async function chooseDevice(gpu: GpuLike | undefined = readNavigatorGpu()): Promise<Device> {
  if (gpu === undefined) return 'wasm'
  const adapter = await gpu.requestAdapter().catch(() => null)
  return adapter === null || adapter === undefined ? 'wasm' : 'webgpu'
}

function readNavigatorGpu(): GpuLike | undefined {
  // The DOM library of TypeScript declares no `navigator.gpu`.
  return 'gpu' in navigator ? (navigator.gpu as GpuLike) : undefined
}
