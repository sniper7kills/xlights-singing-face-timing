import type { SingerFinder } from '../singerFinder.ts'
import { createFixtureSingerFinder } from './fixtureSingerFinder.ts'

// TODO(#119): Return the real engine. The fixture worker keeps the fixture engine for the tests.
/**
 * Returns the engine that `singers.worker.ts` calls.
 * The worker calls it at the first request, so the thread workers of a WASM runtime make no engine.
 */
export function createSingerFinder(): SingerFinder {
  return createFixtureSingerFinder()
}
