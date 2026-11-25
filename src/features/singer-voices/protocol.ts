// The PM fixed this interface on issue #119. The engine and the app side both build against it, so keep each field as it is.
// Issue #129 added the optional field `diagnostics` to the `result` message.
import type { SingerDiagnostics } from '../../lib/singers/diagnostics.ts'

/** One time range in which one singer sings. Ranges of different singers can overlap. */
export interface SingerSegment {
  startMs: number
  endMs: number
  singer: number /* 0, 1, 2 … in order of first appearance */
}

/** The message that starts one singer search in the singers worker. */
export type SingersRequest = {
  type: 'find-singers'
  runId: number
  vocals: Float32Array /* mono, 16 000 Hz */
  /** The count of singers that the person gives. Without it, the engine estimates the count. */
  singerCount?: number
}

/** A message from the singers worker to the page. */
export type SingersMessage =
  | { type: 'download'; runId: number; loadedBytes: number; totalBytes: number }
  | { type: 'progress'; runId: number; doneMs: number; totalMs: number }
  | {
      type: 'result'
      runId: number
      segments: SingerSegment[]
      /** The numbers of the search, for the run report. An engine that has none sends none. */
      diagnostics?: SingerDiagnostics
    }
  | {
      type: 'error'
      runId: number
      kind: 'download' | 'memory' | 'model' | 'unknown'
      detail: string
    }
