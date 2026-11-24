import type { TimedWord } from './types.ts'

/**
 * The sample rate in hertz of the audio that the worker accepts.
 * The `preprocessor_config.json` of each Whisper speech model sets `sampling_rate: 16000`.
 */
export const SPEECH_SAMPLE_RATE = 16_000

/** The length of one audio chunk that the speech model reads, in seconds. */
export const CHUNK_LENGTH_S = 30

/** The overlap at each side of a chunk, in seconds. */
export const STRIDE_LENGTH_S = 5

/** The device that runs the speech model. */
export type Device = 'webgpu' | 'wasm'

/** The cause of a failure that the worker reports. */
export type ErrorKind = 'download' | 'device' | 'memory' | 'unknown'

/** One speech model that the person can select. */
export type SpeechModel = {
  /** The value that `AppSettings.speechModelId` stores. */
  id: string
  /** The repository on the Hugging Face Hub. */
  repo: string
  /** The name that the transcribe dialog shows. */
  label: string
  /** The download size in megabytes (1 MB = 1 000 000 bytes) for the dtype in `SPEECH_MODEL_DTYPE`. */
  downloadMb: number
}

/**
 * The speech models in the order of size.
 * Each repository has `alignment_heads` in `generation_config.json`, so it returns word times.
 */
export const SPEECH_MODELS: readonly SpeechModel[] = [
  {
    id: 'whisper-tiny',
    repo: 'onnx-community/whisper-tiny_timestamped',
    label: 'tiny',
    downloadMb: 66,
  },
  {
    id: 'whisper-base',
    repo: 'onnx-community/whisper-base_timestamped',
    label: 'base',
    downloadMb: 139,
  },
  {
    id: 'whisper-small',
    repo: 'onnx-community/whisper-small_timestamped',
    label: 'small',
    downloadMb: 512,
  },
]

/**
 * The dtype of each module of the speech model.
 * The library docs state that Whisper is sensitive to the quantisation of the encoder.
 * The model load reads the key `encoder_model`. The file list for the cache check and the download total reads the key `model`.
 */
export const SPEECH_MODEL_DTYPE = {
  model: 'fp32',
  encoder_model: 'fp32',
  decoder_model_merged: 'q8',
} as const

/** A message from the app to the worker. */
export type ToWorkerMessage =
  | {
      type: 'load'
      /** One `SpeechModel.id`. */
      speechModelId: string
      device: Device
    }
  | {
      type: 'transcribe'
      runId: string
      /** One channel at `SPEECH_SAMPLE_RATE`. */
      samples: Float32Array
      /** The song time of the first sample. The worker adds it to each word time. */
      offsetMs: number
    }

/** A message from the worker to the app. */
export type FromWorkerMessage =
  | {
      type: 'download'
      /** The bytes that the browser has for the files that started to load. */
      loadedBytes: number
      /** The size of the files that started to load. The value grows when the next file starts. */
      totalBytes: number
    }
  | { type: 'ready' }
  | {
      type: 'progress'
      runId: string
      /** The audio time that is complete, from the first sample of the run. */
      doneMs: number
    }
  | { type: 'result'; runId: string; words: TimedWord[] }
  | { type: 'error'; runId?: string; kind: ErrorKind; detail: string }

/** One word chunk of the speech model output. The times are in seconds. */
export type WordChunk = { text: string; timestamp: readonly [number | null, number | null] }

/**
 * Returns the words that have a start time and an end time, in milliseconds of the song.
 * The library can return `null` as the end time of the last word of the audio.
 * @param chunks The `chunks` of the speech model output with `return_timestamps: 'word'`.
 * @param offsetMs The song time of the first sample of the run.
 */
export function wordsFromChunks(chunks: readonly WordChunk[], offsetMs: number): TimedWord[] {
  const words: TimedWord[] = []
  for (const { text, timestamp } of chunks) {
    const [start, end] = timestamp
    const label = text.trim()
    if (start === null || end === null || label === '') continue
    words.push({ text: label, startMs: offsetMs + start * 1000, endMs: offsetMs + end * 1000 })
  }
  return words
}

/**
 * Returns the audio time that is complete after a chunk of the run.
 * @param chunkIndex The index of the chunk that is complete, from 0.
 * @param sampleCount The number of samples of the run.
 */
export function doneMsAfterChunk(chunkIndex: number, sampleCount: number): number {
  const stepS = CHUNK_LENGTH_S - 2 * STRIDE_LENGTH_S
  const endS = chunkIndex * stepS + CHUNK_LENGTH_S
  return Math.min(endS * 1000, (sampleCount / SPEECH_SAMPLE_RATE) * 1000)
}

const NETWORK_PATTERN =
  /failed to fetch|networkerror|network error|load failed|could not locate file|unable to get model file/i
const MEMORY_PATTERN =
  /out of memory|memory access out of bounds|array buffer allocation|bad_alloc|oom/i

/**
 * Returns the kind of a failure in the worker.
 * A WebGPU failure other than a download failure is a device failure, so the app retries on `wasm`.
 * @param error The value that the library threw.
 * @param device The device of the run that failed.
 */
export function errorKind(error: unknown, device: Device): ErrorKind {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (NETWORK_PATTERN.test(text)) return 'download'
  if (device === 'webgpu') return 'device'
  if (error instanceof RangeError || MEMORY_PATTERN.test(text)) return 'memory'
  return 'unknown'
}
