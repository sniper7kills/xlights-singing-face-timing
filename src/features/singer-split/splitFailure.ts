import { separationFailureKind } from '../vocal-separation/separationFailure.ts'
import type { SplitFailureKind } from './protocol.ts'

/**
 * An engine failure with a known cause.
 * The engine throws it for a model download that fails, a model that does not run, or a browser with no WebGPU.
 */
export class SplitFailure extends Error {
  readonly kind: SplitFailureKind
  constructor(kind: SplitFailureKind, detail: string) {
    super(detail)
    this.name = 'SplitFailure'
    this.kind = kind
  }
}

/**
 * Returns the cause of an engine failure.
 * A `SplitFailure` keeps its kind. A `RangeError` or a memory text gives 'memory'. Any other failure gives 'unknown'.
 * @param error The rejection of the engine.
 */
export function splitFailureKind(error: unknown): SplitFailureKind {
  if (error instanceof SplitFailure) return error.kind
  return separationFailureKind(error)
}
