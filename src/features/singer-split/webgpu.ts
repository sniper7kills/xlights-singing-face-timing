import { hasWebGpu } from '../transcription/device.ts'

declare global {
  /**
   * When a test sets this flag before the app starts, the singer split reads it in place of the WebGPU check.
   * Headless Chromium can have no WebGPU adapter, so the E2E tests must not depend on the real check.
   */
  var __SPLIT_WEBGPU__: boolean | undefined
}

/**
 * Returns true when the browser can run the singer split: `navigator.gpu` exists and gives an adapter.
 * @param check The WebGPU check. Tests replace it.
 */
export function canSplitSingers(check: () => Promise<boolean> = hasWebGpu): Promise<boolean> {
  const forced = globalThis.__SPLIT_WEBGPU__
  return forced === undefined ? check() : Promise.resolve(forced)
}
