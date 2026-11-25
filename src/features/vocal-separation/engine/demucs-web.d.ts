// `demucs-web` 1.0.2 ships JavaScript with no type file. These types copy the API section of its README.
declare module 'demucs-web' {
  import type * as ort from 'onnxruntime-web'

  export interface ProgressInfo {
    progress: number
    currentSegment: number
    totalSegments: number
  }

  export interface DemucsProcessorOptions {
    ort: typeof ort
    modelPath?: string
    sessionOptions?: ort.InferenceSession.SessionOptions
    onProgress?: (info: ProgressInfo) => void
    onLog?: (phase: string, message: string) => void
    onDownloadProgress?: (loaded: number, total: number) => void
  }

  export interface StereoTrack {
    left: Float32Array
    right: Float32Array
  }

  export interface SeparationResult {
    drums: StereoTrack
    bass: StereoTrack
    other: StereoTrack
    vocals: StereoTrack
  }

  export class DemucsProcessor {
    constructor(options: DemucsProcessorOptions)
    loadModel(pathOrBuffer?: string | ArrayBuffer): Promise<void>
    separate(left: Float32Array, right: Float32Array): Promise<SeparationResult>
  }
}
