/**
 * The most threads that the `wasm` device uses.
 * More threads gave no more speed in the measured runs of ADR 0005.
 */
export const MAX_WASM_THREADS = 4

/**
 * Returns the thread count for the ONNX runtime on the `wasm` device, or undefined for the library default.
 * The browser gives `SharedArrayBuffer`, and so more than one thread, only to a cross-origin isolated page.
 * @param isolated The `crossOriginIsolated` value of the worker.
 * @param cores The `navigator.hardwareConcurrency` value. A browser can report a low value for privacy.
 */
export function wasmThreads(isolated: boolean, cores: number): number | undefined {
  if (!isolated) return undefined
  return Math.max(1, Math.min(MAX_WASM_THREADS, cores))
}
