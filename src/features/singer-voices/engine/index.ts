import type { SingerFinder } from '../singerFinder.ts'
import { createPyannoteSingerFinder } from './pyannoteSingerFinder.ts'

/**
 * Returns the engine that `singers.worker.ts` calls.
 * The worker calls it at the first request, so the thread workers of a WASM runtime make no engine.
 */
export function createSingerFinder(): SingerFinder {
  return createPyannoteSingerFinder()
}
