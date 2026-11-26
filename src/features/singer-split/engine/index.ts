import type { Splitter } from '../splitter.ts'

/**
 * Returns the engine of the singer split, for `split.worker.ts`.
 * The worker calls it at the first request, so the thread workers of the WASM runtime load no engine module.
 */
export function createSplitter(): Splitter {
  return {
    async split(vocals, mode, on, signal) {
      const { createRoformerSplitter } = await import('./roformerSplitter.ts')
      return createRoformerSplitter().split(vocals, mode, on, signal)
    },
  }
}
