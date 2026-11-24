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
 * The time after a WebGPU failure until the app tries WebGPU again: 7 days.
 * One stall can come from a busy graphics card or an old driver, so one failure must not block WebGPU for all time.
 */
export const RETRY_FAILED_DEVICE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Returns the device for the next run of one speech model: the faster device of the stored speeds.
 * Each device that exists runs once before the app compares them.
 * The `wasm` device runs first, because an integrated graphics card can run 4 times slower than the CPU.
 * A failed WebGPU device runs again when its failure is `RETRY_FAILED_DEVICE_MS` old or older.
 * @param webgpu True when the browser gives a WebGPU adapter.
 * @param speeds The stored speeds of the speech model, in seconds of audio for each second of run.
 * @param nowMs The current `Date.now()`.
 */
export function pickDevice(
  webgpu: boolean,
  speeds: DeviceSpeeds | undefined,
  nowMs: number,
): Device {
  if (!webgpu || speeds?.wasm === undefined) return 'wasm'
  if (speeds.webgpu === undefined || webgpuRetryDue(speeds, nowMs)) return 'webgpu'
  return speeds.webgpu > speeds.wasm ? 'webgpu' : 'wasm'
}

function webgpuRetryDue(speeds: DeviceSpeeds, nowMs: number): boolean {
  // A failure with no time comes from an earlier version of the app, so it counts as a failure now.
  const failedAtMs = speeds.failedAtMs?.webgpu ?? nowMs
  return speeds.webgpu === 0 && nowMs - failedAtMs >= RETRY_FAILED_DEVICE_MS
}

/**
 * Returns the stored speeds with a failure time for each failed WebGPU device that has none.
 * A record from an earlier version of the app stores a failure as a bare 0. The app counts it as a failure at `nowMs`.
 * Returns `all` itself when no failure time is missing, so the caller writes only a changed record.
 * @param all The stored speeds for each speech model id.
 * @param nowMs The current `Date.now()`.
 */
export function withFailureTimes(
  all: Readonly<Record<string, DeviceSpeeds>>,
  nowMs: number,
): Readonly<Record<string, DeviceSpeeds>> {
  const missing = Object.entries(all).filter(
    ([, speeds]) => speeds.webgpu === 0 && speeds.failedAtMs?.webgpu === undefined,
  )
  if (missing.length === 0) return all
  const stamped = missing.map(([id, speeds]) => [
    id,
    { ...speeds, failedAtMs: { ...speeds.failedAtMs, webgpu: nowMs } },
  ])
  return { ...all, ...Object.fromEntries(stamped) }
}

/**
 * Returns the stored speeds with one new speed for one speech model, and keeps the other values.
 * The speed 0 records `nowMs` as the failure time of the device. A speed above 0 removes the failure time.
 * @param all The stored speeds for each speech model id.
 * @param speechModelId The speech model of the run.
 * @param device The device of the run.
 * @param speed The seconds of audio for each second of run. A failed or stalled device has 0.
 * @param nowMs The current `Date.now()`.
 */
export function withSpeed(
  all: Readonly<Record<string, DeviceSpeeds>>,
  speechModelId: string,
  device: Device,
  speed: number,
  nowMs: number,
): Record<string, DeviceSpeeds> {
  const { failedAtMs, ...speeds } = all[speechModelId] ?? {}
  const failures = Object.fromEntries(
    Object.entries(failedAtMs ?? {}).filter(([failed]) => failed !== device),
  )
  if (speed === 0) failures[device] = nowMs
  const next: DeviceSpeeds = { ...speeds, [device]: speed }
  if (Object.keys(failures).length > 0) next.failedAtMs = failures
  return { ...all, [speechModelId]: next }
}
