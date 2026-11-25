import type { SeparateMessage } from './protocol.ts'

/** The cause of a failed vocal separation, as the separate worker reports it. */
export type SeparationFailureKind = Extract<SeparateMessage, { type: 'error' }>['kind']

/**
 * An engine failure with a known cause.
 * The engine throws it for a model download that fails or a model that does not run, so the dialog shows the correct message.
 */
export class SeparationFailure extends Error {
  readonly kind: SeparationFailureKind
  constructor(kind: SeparationFailureKind, detail: string) {
    super(detail)
    this.name = 'SeparationFailure'
    this.kind = kind
  }
}

// The browser and the WASM runtime name an allocation failure in different words.
const MEMORY_PATTERN = /out of memory|allocation failed/i

/**
 * Returns the cause of an engine failure.
 * A `SeparationFailure` keeps its kind. A `RangeError` or a memory text gives 'memory'. Any other failure gives 'unknown'.
 * @param error The rejection of the engine.
 */
export function separationFailureKind(error: unknown): SeparationFailureKind {
  if (error instanceof SeparationFailure) return error.kind
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (error instanceof RangeError || MEMORY_PATTERN.test(text)) return 'memory'
  return 'unknown'
}
