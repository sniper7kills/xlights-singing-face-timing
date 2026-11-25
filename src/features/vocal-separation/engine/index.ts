import type { Separator } from '../separator.ts'
import { createSpleeterSeparator } from './spleeterSeparator.ts'

/**
 * Returns the engine that `separate.worker.ts` calls.
 * The worker calls it at the first request, so the thread workers of a WASM runtime make no engine.
 */
export function createSeparator(): Separator {
  return createSpleeterSeparator()
}
