// The PM fixed this interface on issue #119. The engine and the app side both build against it, so keep each field as it is.

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
}

/** A message from the singers worker to the page. */
export type SingersMessage =
  | { type: 'download'; runId: number; loadedBytes: number; totalBytes: number }
  | { type: 'progress'; runId: number; doneMs: number; totalMs: number }
  | { type: 'result'; runId: number; segments: SingerSegment[] }
  | {
      type: 'error'
      runId: number
      kind: 'download' | 'memory' | 'model' | 'unknown'
      detail: string
    }
