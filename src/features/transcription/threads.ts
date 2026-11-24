/**
 * The most threads that the `wasm` device uses.
 * In the measured runs of ADR 0006, 2 threads were the fastest, and 4 or 8 threads were slower than 2.
 * The ONNX runtime default is up to 4 threads, so the app sets the value.
 */
export const MAX_WASM_THREADS = 2

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
