// The PM fixed this interface on issue #117. The engine and the app side both build against it, so keep each field as it is.

/** Stereo audio at 44 100 Hz. Both channels have the same length. */
export interface StereoAudio {
  left: Float32Array
  right: Float32Array
  sampleRate: 44100
}

/** The message that starts one vocal separation in the separate worker. */
export type SeparateRequest = { type: 'separate'; runId: number; audio: StereoAudio }

/** A message from the separate worker to the page. */
export type SeparateMessage =
  | { type: 'download'; runId: number; loadedBytes: number; totalBytes: number }
  | { type: 'progress'; runId: number; doneMs: number; totalMs: number }
  | {
      type: 'result'
      runId: number
      vocals: Float32Array /* mono, 44 100 Hz, same length as the input */
    }
  | {
      type: 'error'
      runId: number
      kind: 'download' | 'memory' | 'model' | 'unknown'
      detail: string
    }
