import type { DeviceSpeeds } from '../../store/types.ts'
import type { Device } from './protocol.ts'

/** The part of `navigator.gpu` that the device check reads. */
type GpuLike = { requestAdapter(): Promise<unknown> }

/**
 * Returns true when the browser gives a WebGPU adapter.
 * A browser can expose `navigator.gpu` and still return no adapter, for example with a blocked graphics driver.
 * @param gpu The WebGPU entry point of the browser. The default reads `navigator.gpu`.
 */
export async function hasWebGpu(
  // The DOM library of TypeScript declares no `navigator.gpu`.
  gpu: GpuLike | undefined = 'gpu' in navigator ? (navigator.gpu as GpuLike) : undefined,
): Promise<boolean> {
  if (gpu === undefined) return false
  const adapter = await gpu.requestAdapter().catch(() => null)
  return adapter !== null && adapter !== undefined
}

/**
 * Returns the device for the next run of one speech model: the faster device of the stored speeds.
 * Each device that exists runs once before the app compares them.
 * The `wasm` device runs first, because an integrated graphics card can run 4 times slower than the CPU.
 * @param webgpu True when the browser gives a WebGPU adapter.
 * @param speeds The stored speeds of the speech model, in seconds of audio for each second of run.
 */
export function pickDevice(webgpu: boolean, speeds: DeviceSpeeds | undefined): Device {
  if (!webgpu || speeds?.wasm === undefined) return 'wasm'
  if (speeds.webgpu === undefined) return 'webgpu'
  return speeds.webgpu > speeds.wasm ? 'webgpu' : 'wasm'
}

/**
 * Returns the stored speeds with one new speed for one speech model, and keeps the other values.
 * @param all The stored speeds for each speech model id.
 * @param speechModelId The speech model of the run.
 * @param device The device of the run.
 * @param speed The seconds of audio for each second of run. A failed or stalled device has 0.
 */
export function withSpeed(
  all: Readonly<Record<string, DeviceSpeeds>>,
  speechModelId: string,
  device: Device,
  speed: number,
): Record<string, DeviceSpeeds> {
  return { ...all, [speechModelId]: { ...all[speechModelId], [device]: speed } }
}
