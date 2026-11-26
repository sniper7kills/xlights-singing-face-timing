import { SplitFailure } from '../splitFailure.ts'
import type { Splitter } from '../splitter.ts'

/**
 * Returns the engine of the singer split, for `split.worker.ts`.
 * This version of the app has no real engine, so each split rejects with a `not-available` failure.
 */
export function createSplitter(): Splitter {
  return {
    // TODO(#194): Return the engine that loads the model files and runs with WebGPU.
    split: () =>
      Promise.reject(
        new SplitFailure('not-available', 'This version of the app has no singer split engine.'),
      ),
  }
}
