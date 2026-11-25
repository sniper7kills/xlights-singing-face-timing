import { separationFailureKind } from '../vocal-separation/separationFailure.ts'
import type { SingersMessage } from './protocol.ts'

/** The cause of a failed singer search, as the singers worker reports it. */
export type SingerFailureKind = Extract<SingersMessage, { type: 'error' }>['kind']

/**
 * An engine failure with a known cause.
 * The engine throws it for a model download that fails or a model that does not run, so the app shows the correct message.
 */
export class SingerFailure extends Error {
  readonly kind: SingerFailureKind
  constructor(kind: SingerFailureKind, detail: string) {
    super(detail)
    this.name = 'SingerFailure'
    this.kind = kind
  }
}

/**
 * Returns the cause of an engine failure.
 * A `SingerFailure` keeps its kind. A `RangeError` or a memory text gives 'memory'. Any other failure gives 'unknown'.
 * @param error The rejection of the engine.
 */
export function singerFailureKind(error: unknown): SingerFailureKind {
  if (error instanceof SingerFailure) return error.kind
  return separationFailureKind(error)
}
