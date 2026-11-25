// The PM fixed this interface on issue #117. The engine and the app side both build against it, so keep each field as it is.

/** Stereo audio at 44 100 Hz. Both channels have the same length. */
export interface StereoAudio {
  left: Float32Array
  right: Float32Array
  sampleRate: 44100
}

/** The id of a vocal separation model. Issue #122 adds 'demucs' as the second model. */
export type SeparationModelId = 'spleeter' | 'demucs'

/**
 * The message that starts one vocal separation in the separate worker. With no `model`, the worker uses 'spleeter'.
 * Issue #129 added `instruments`: true asks the worker for the instruments too. Without it, the worker computes and sends no instruments.
 */
export type SeparateRequest = {
  type: 'separate'
  runId: number
  audio: StereoAudio
  model?: SeparationModelId
  instruments?: boolean
}

/** The result of one vocal separation. Each channel is mono, at 44 100 Hz, with the length of the input. */
export type SeparatedAudio = {
  vocals: Float32Array
  /** The audio without the vocals. Only a request with `instruments` gets it. */
  instruments?: Float32Array
}

/** A message from the separate worker to the page. */
export type SeparateMessage =
  | { type: 'download'; runId: number; loadedBytes: number; totalBytes: number }
  | { type: 'progress'; runId: number; doneMs: number; totalMs: number }
  | {
      type: 'result'
      runId: number
      vocals: Float32Array /* mono, 44 100 Hz, same length as the input */
      instruments?: Float32Array /* mono, 44 100 Hz, same length as the input; issue #129 */
    }
  | {
      type: 'error'
      runId: number
      kind: 'download' | 'memory' | 'model' | 'unknown'
      detail: string
    }
