import {
  ModelRegistry,
  TextStreamer,
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
  type WhisperTextStreamer,
} from '@huggingface/transformers'
// The library fetches the ONNX runtime from cdn.jsdelivr.net by default, and the CSP blocks that host.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import {
  CHUNK_LENGTH_S,
  SPEECH_MODEL_DTYPE,
  SPEECH_MODELS,
  STRIDE_LENGTH_S,
  createRunClock,
  errorKind,
  type RunClock,
  wordsFromChunks,
  type Device,
  type FromWorkerMessage,
  type ToWorkerMessage,
  type WordChunk,
} from '../features/transcription/protocol.ts'

const TASK = 'automatic-speech-recognition'

const onnxWasm = env.backends.onnx.wasm
if (onnxWasm) onnxWasm.wasmPaths = { wasm: ortWasmUrl }

/** The tokenizer of a Whisper pipeline. It has the id of the first timestamp token. */
type Tokenizer = ConstructorParameters<typeof WhisperTextStreamer>[0]

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedDevice: Device = 'wasm'
let busy = false
let onChunkEnd: (() => void) | null = null

function post(message: FromWorkerMessage): void {
  self.postMessage(message)
}

/**
 * Receives the tokens of each generate pass and reports the audio time of each timestamp token.
 * The typed pipeline options accept a `TextStreamer` only.
 * `TextStreamer` and `WhisperTextStreamer` decode the text after each token, and the run needs no text, so `put` and `end` replace theirs.
 */
class ProgressStreamer extends TextStreamer {
  private readonly clock: RunClock
  private readonly onDone: (doneMs: number) => void

  constructor(tokenizer: Tokenizer, clock: RunClock, onDone: (doneMs: number) => void) {
    super(tokenizer, { callback_function: () => undefined })
    this.clock = clock
    this.onDone = onDone
  }

  put(value: bigint[][]): void {
    const doneMs = this.clock.token(value[0] ?? [])
    if (doneMs !== null) this.onDone(doneMs)
  }

  end(): void {
    this.clock.passEnd()
  }
}

async function load(speechModelId: string, device: Device): Promise<void> {
  const model = SPEECH_MODELS.find((candidate) => candidate.id === speechModelId)
  if (model === undefined) throw new Error(`Unknown speech model: ${speechModelId}`)
  await transcriber?.dispose()
  transcriber = null
  const options = { device, dtype: SPEECH_MODEL_DTYPE }
  // The library reports progress for cached files too, and a cached speech model shows no download state.
  const cached = await ModelRegistry.is_pipeline_cached(TASK, model.repo, options).catch(
    () => false,
  )
  transcriber = await pipeline(TASK, model.repo, {
    ...options,
    progress_callback: (info: ProgressInfo) => {
      if (cached || info.status !== 'progress_total') return
      post({ type: 'download', loadedBytes: info.loaded, totalBytes: info.total })
    },
  })
  const speechModel = transcriber.model
  const generate = speechModel.generate.bind(speechModel)
  // The pipeline calls `model.generate` once for each chunk, and the library has no progress event for a run.
  speechModel.generate = async (...args) => {
    const output = await generate(...args)
    onChunkEnd?.()
    return output
  }
  loadedDevice = device
}

async function transcribe(runId: string, samples: Float32Array, offsetMs: number): Promise<void> {
  if (transcriber === null) throw new Error('No speech model is loaded.')
  const postDone = (doneMs: number) => post({ type: 'progress', runId, doneMs })
  // The library types the tokenizer as `PreTrainedTokenizer`. A Whisper pipeline has a `WhisperTokenizer`.
  const tokenizer = transcriber.tokenizer as Tokenizer
  const clock = createRunClock(samples.length, tokenizer.timestamp_begin)
  // The timestamp tokens give the audio time inside a chunk, so the progress moves before the chunk ends.
  const streamer = new ProgressStreamer(tokenizer, clock, postDone)
  onChunkEnd = () => postDone(clock.chunkEnd())
  const output = await transcriber(samples, {
    return_timestamps: 'word',
    chunk_length_s: CHUNK_LENGTH_S,
    stride_length_s: STRIDE_LENGTH_S,
    language: 'english',
    task: 'transcribe',
    streamer,
  }).finally(() => {
    onChunkEnd = null
  })
  // The typed API declares `[number, number]`, but the last word of the audio can have a `null` end.
  const chunks: readonly WordChunk[] = output.chunks ?? []
  post({ type: 'result', runId, words: wordsFromChunks(chunks, offsetMs) })
}

self.addEventListener('message', (event: MessageEvent<ToWorkerMessage>) => {
  const message = event.data
  if (message.type === 'load') {
    load(message.speechModelId, message.device).then(
      () => post({ type: 'ready' }),
      (error: unknown) =>
        post({ type: 'error', kind: errorKind(error, message.device), detail: String(error) }),
    )
    return
  }
  const { runId } = message
  if (busy) {
    post({ type: 'error', runId, kind: 'unknown', detail: 'A transcribe run is already active.' })
    return
  }
  busy = true
  transcribe(runId, message.samples, message.offsetMs)
    .catch((error: unknown) =>
      post({ type: 'error', runId, kind: errorKind(error, loadedDevice), detail: String(error) }),
    )
    .finally(() => {
      busy = false
    })
})
