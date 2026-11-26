import { SPLIT_LABELS } from '../../../lib/singers/splitRules.ts'
import type { StereoAudio } from '../../vocal-separation/protocol.ts'
import type { SplitMode, SplitResult } from '../protocol.ts'
import { SplitFailure } from '../splitFailure.ts'
import type { SplitterEvents } from '../splitter.ts'
import type { SplitModel } from '../splitModels.ts'
import {
  BINS,
  chunkStarts,
  createOverlapAdd,
  createRoformerStft,
  fadeWindow,
  type RoformerStft,
} from './roformerSignal.ts'

/** The names of the input and the output of both graphs, from section 2 of the contract. */
export const INPUT_NAME = 'spec'
export const OUTPUT_NAME = 'out'

/** The count of chunks that cover each sample. The contract uses 2 as the default. */
export const OVERLAP = 2

/** The part of an ONNX runtime tensor that the run uses. Tests supply a fake. */
export type TensorLike = {
  readonly dims: readonly number[]
  readonly data: unknown
  dispose(): void
}

/** The part of an ONNX runtime session that the run uses. Tests supply a fake. */
export type SessionLike<T extends TensorLike> = {
  run(feeds: Record<string, T>): Promise<Record<string, T>>
  release(): Promise<void>
}

/** The functions that connect the run to the ONNX runtime and the model files. Tests supply fakes. */
export type SplitRuntime<T extends TensorLike> = {
  /**
   * Returns the contents of the model file, from the browser cache or from the site.
   * Rejects with a `SplitFailure` of kind 'download' when the download fails, or has the wrong size or hash.
   */
  loadModel(model: SplitModel, onDownload: SplitterEvents['download']): Promise<ArrayBuffer>
  /** Returns a WebGPU session of the model. Rejects with the error of the runtime. */
  createSession(contents: Uint8Array): Promise<SessionLike<T>>
  /** Returns a float32 tensor that holds `data`, with no copy. */
  tensor(data: Float32Array, dims: readonly number[]): T
}

const NO_BACKEND = /no available backend|Failed to get GPU adapter|WebGPU is not supported/i
// onnxruntime names the limit of the device that a shader passes, for example `maxStorageBuffersPerShaderStage`.
const GPU_LIMIT = /Too many storage buffers|limits_?\.max\w+|exceeds? the max\w* \w*\s?limit/i
const MEMORY = /out of memory|bad_alloc|allocation failed|device (?:was |is )?lost|OutOfMemory/i

/**
 * Returns the failure that the engine reports for an error of the ONNX runtime.
 * - No WebGPU adapter, no `navigator.gpu`, or a shader that passes a limit of the GPU device: 'not-available'.
 * - A failed allocation, or a lost GPU device: 'memory'.
 * - Another error at the session start: 'model'. Another error in a chunk: 'unknown'.
 * @param error The rejection of the runtime.
 * @param step 'load' for the session start, 'run' for a chunk.
 */
export function runtimeFailure(error: unknown, step: 'load' | 'run'): SplitFailure {
  if (error instanceof SplitFailure) return error
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const detail = `The singer split model failed: ${text}`
  if (NO_BACKEND.test(text) || GPU_LIMIT.test(text))
    return new SplitFailure('not-available', detail)
  if (error instanceof RangeError || MEMORY.test(text)) return new SplitFailure('memory', detail)
  return new SplitFailure(step === 'load' ? 'model' : 'unknown', detail)
}

function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new SplitFailure('unknown', 'The person cancelled the singer split.')
}

/**
 * Returns the session of the model of the mode.
 * The function drops its reference to the file contents when it returns, so the browser can free them during the run.
 */
async function openSession<T extends TensorLike>(
  runtime: SplitRuntime<T>,
  model: SplitModel,
  on: SplitterEvents,
  signal: AbortSignal,
): Promise<SessionLike<T>> {
  const contents = await runtime.loadModel(model, on.download)
  stopIfAborted(signal)
  try {
    return await runtime.createSession(new Uint8Array(contents))
  } catch (error) {
    throw runtimeFailure(error, 'load')
  }
}

/** Returns the samples of one channel from `start`, padded with zeros to the chunk length. */
function chunkOf(channel: Float32Array, start: number, chunkSamples: number): Float32Array {
  const samples = new Float32Array(chunkSamples)
  samples.set(channel.subarray(start, start + chunkSamples))
  return samples
}

/** Returns the data of the output tensor. Throws a `SplitFailure` of kind 'model' for a missing output or a wrong shape. */
function outputData(output: TensorLike | undefined, frames: number): Float32Array {
  const expected = [1, 2, 2, BINS, frames, 2]
  if (
    output === undefined ||
    !(output.data instanceof Float32Array) ||
    output.dims.join(',') !== expected.join(',')
  ) {
    const shape = output === undefined ? 'no output' : `the shape [${output.dims.join(', ')}]`
    throw new SplitFailure(
      'model',
      `The singer split model gave ${shape}, not "${OUTPUT_NAME}" with the shape [${expected.join(', ')}].`,
    )
  }
  return output.data
}

/** Returns the samples of each stem and channel of one chunk: `[stem][channel]`. */
async function runChunk<T extends TensorLike>(
  session: SessionLike<T>,
  runtime: SplitRuntime<T>,
  stft: RoformerStft,
  channels: readonly [Float32Array, Float32Array],
  input: Float32Array,
): Promise<Float32Array[][]> {
  stft.forward(channels, input)
  const feed = runtime.tensor(input, [1, 2, BINS, stft.frames, 2])
  let outputs: Record<string, T> = {}
  try {
    outputs = await session.run({ [INPUT_NAME]: feed })
    const data = outputData(outputs[OUTPUT_NAME], stft.frames)
    return [0, 1].map((stem) => [0, 1].map((channel) => stft.inverse(data, stem, channel)))
  } catch (error) {
    throw runtimeFailure(error, 'run')
  } finally {
    // A WebGPU tensor holds a GPU buffer until its disposal, so each chunk frees its tensors.
    feed.dispose()
    for (const tensor of Object.values(outputs)) tensor.dispose()
  }
}

/** Returns the tracks of the mode in label order, from the stems in output order. */
function tracksOf(mode: SplitMode, model: SplitModel, stems: Float32Array[][]): SplitResult {
  return {
    tracks: SPLIT_LABELS[mode].map((label) => {
      const [left, right] = stems[model.stems.indexOf(label)] ?? []
      if (left === undefined || right === undefined)
        throw new SplitFailure('model', `The model table has no stem for the label ${label}.`)
      return { label, audio: { left, right, sampleRate: 44100 } }
    }),
  }
}

async function runChunks<T extends TensorLike>(
  session: SessionLike<T>,
  runtime: SplitRuntime<T>,
  model: SplitModel,
  vocals: StereoAudio,
  on: SplitterEvents,
  signal: AbortSignal,
): Promise<Float32Array[][]> {
  const length = vocals.left.length
  const chunk = model.chunkSamples
  const stft = createRoformerStft(chunk)
  const sum = createOverlapAdd(length, fadeWindow(chunk))
  const input = new Float32Array(2 * BINS * stft.frames * 2)
  const toMs = (samples: number) => (samples / vocals.sampleRate) * 1000
  on.progress(0, toMs(length))
  for (const start of chunkStarts(length, chunk, Math.floor(chunk / OVERLAP))) {
    stopIfAborted(signal)
    const channels: [Float32Array, Float32Array] = [
      chunkOf(vocals.left, start, chunk),
      chunkOf(vocals.right, start, chunk),
    ]
    const output = await runChunk(session, runtime, stft, channels, input)
    // A song shorter than one chunk runs padded with zeros, and only its own samples count.
    const count = Math.min(chunk, length - start)
    sum.add(output, start, count)
    on.progress(toMs(start + count), toMs(length))
  }
  return sum.finish()
}

/**
 * Returns the two singer tracks of the vocals, in the label order of the mode, each stereo at 44 100 Hz with the length of the input.
 * The run follows the contract of issue #191: chunks of the model length, two chunks over each sample, a Hamming fade, and the last chunk at the end of the audio.
 * It reports the progress after each chunk, and stops between chunks when the signal aborts.
 * It releases the session at the end, also after a failure or an abort.
 * @param runtime The model download and the ONNX runtime.
 * @param model The model of the mode, from `SPLIT_MODELS`.
 * @param vocals The vocals at 44 100 Hz.
 * @param mode The mode of the run.
 * @param on The functions that receive the progress.
 * @param signal Aborts when the person cancels.
 * Rejects with a `SplitFailure`: 'download', 'not-available', 'memory', 'model' or 'unknown'.
 */
export async function runRoformerSplit<T extends TensorLike>(
  runtime: SplitRuntime<T>,
  model: SplitModel,
  vocals: StereoAudio,
  mode: SplitMode,
  on: SplitterEvents,
  signal: AbortSignal,
): Promise<SplitResult> {
  stopIfAborted(signal)
  const session = await openSession(runtime, model, on, signal)
  try {
    return tracksOf(mode, model, await runChunks(session, runtime, model, vocals, on, signal))
  } finally {
    // A failed release must not hide the result or the cause of a failure.
    await session.release().catch(() => undefined)
  }
}
