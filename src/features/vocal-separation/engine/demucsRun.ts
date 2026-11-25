import type { StereoAudio } from '../protocol.ts'
import { SeparationFailure } from '../separationFailure.ts'
import type { SeparatorEvents } from '../separator.ts'
import { DEMUCS } from './demucsModel.ts'

/** The ONNX runtime device of a Demucs run. */
export type DemucsDevice = 'webgpu' | 'wasm'

/** One stem of `DemucsProcessor.separate`: two channels with the length of the input. */
export type StereoStem = { left: Float32Array; right: Float32Array }

/** The part of `DemucsProcessor` of `demucs-web` that the engine calls. Tests supply a fake. */
export type DemucsProcessorLike = {
  loadModel(model: ArrayBuffer): Promise<unknown>
  separate(left: Float32Array, right: Float32Array): Promise<{ vocals: StereoStem }>
}

/**
 * Makes a processor for one device.
 * @param device The device of the ONNX runtime session.
 * @param onSegment Receives the count of the segments that are complete.
 */
export type CreateDemucsProcessor = (
  device: DemucsDevice,
  onSegment: (segments: number) => void,
) => DemucsProcessorLike

/**
 * Returns the devices to try, in order. The engine tries `webgpu` first only when the browser gives an adapter.
 * @param adapter True when `navigator.gpu` gives an adapter in the worker.
 */
export function demucsDevices(adapter: boolean): readonly DemucsDevice[] {
  return adapter ? ['webgpu', 'wasm'] : ['wasm']
}

/**
 * Returns the audio samples that are complete after a count of segments.
 * `DemucsProcessor.separate` starts a segment each `stride` samples, and each segment has `segmentSamples` samples.
 * @param segments The count of the segments that are complete.
 * @param total The samples of the run.
 */
export function demucsDoneSamples(segments: number, total: number): number {
  if (segments <= 0) return 0
  const stride = Math.floor(DEMUCS.segmentSamples * (1 - DEMUCS.overlap))
  return Math.min(total, (segments - 1) * stride + DEMUCS.segmentSamples)
}

/**
 * Returns the vocals stem as one channel: the mean of the two channels, with the length of the input.
 * @param vocals The vocals stem of the package.
 * @param length The samples of the input.
 * Throws a `SeparationFailure` of kind 'model' when the stem has another length or a value that is not finite.
 */
export function monoVocals(vocals: StereoStem, length: number): Float32Array {
  if (vocals.left.length !== length || vocals.right.length !== length) {
    throw new SeparationFailure(
      'model',
      `The Demucs vocals have ${vocals.left.length} samples, not ${length}.`,
    )
  }
  const mono = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    mono[index] = ((vocals.left[index] ?? 0) + (vocals.right[index] ?? 0)) / 2
    if (!Number.isFinite(mono[index])) {
      throw new SeparationFailure('model', `The Demucs vocals have a value that is not finite.`)
    }
  }
  return mono
}

// The WASM runtime reports a failed allocation as a C++ `std::bad_alloc`, and a browser as an out-of-memory text.
const MEMORY_TEXT = /bad_alloc|out of memory|allocation failed/i

/**
 * Returns the failure that the engine reports for an error of the package.
 * @param error The rejection of `loadModel` or `separate`.
 * @param step 'load' for `loadModel`, which gives 'model' for an unknown cause. 'run' gives 'unknown'.
 */
export function demucsFailure(error: unknown, step: 'load' | 'run'): SeparationFailure {
  if (error instanceof SeparationFailure) return error
  const detail = `The Demucs model failed: ${String(error)}`
  if (error instanceof RangeError || MEMORY_TEXT.test(String(error)))
    return new SeparationFailure('memory', detail)
  return new SeparationFailure(step === 'load' ? 'model' : 'unknown', detail)
}

async function runOnDevice(
  processor: DemucsProcessorLike,
  model: ArrayBuffer,
  audio: StereoAudio,
): Promise<Float32Array> {
  try {
    await processor.loadModel(model)
  } catch (error) {
    throw demucsFailure(error, 'load')
  }
  try {
    const { vocals } = await processor.separate(audio.left, audio.right)
    return monoVocals(vocals, audio.left.length)
  } catch (error) {
    throw demucsFailure(error, 'run')
  }
}

/**
 * Returns the vocals of the audio from the Demucs model: one channel at 44 100 Hz, with the length of the input.
 * A failure on a device that has a next device tries the next device, so a broken WebGPU run goes on with `wasm`.
 * @param model The contents of the model file.
 * @param audio The stereo audio of the run.
 * @param on The functions that receive the progress. Each device starts the progress again at 0.
 * @param devices The devices to try, in order.
 * @param createProcessor Makes the processor of the package for one device.
 * Rejects with the `SeparationFailure` of the last device.
 */
export async function runDemucs(
  model: ArrayBuffer,
  audio: StereoAudio,
  on: SeparatorEvents,
  devices: readonly DemucsDevice[],
  createProcessor: CreateDemucsProcessor,
): Promise<Float32Array> {
  const total = audio.left.length
  const toMs = (samples: number) => (samples / audio.sampleRate) * 1000
  let failure = new SeparationFailure('model', 'No device can run the Demucs model.')
  for (const device of devices) {
    on.progress(0, toMs(total))
    const processor = createProcessor(device, (segments) =>
      on.progress(toMs(demucsDoneSamples(segments, total)), toMs(total)),
    )
    try {
      return await runOnDevice(processor, model, audio)
    } catch (error) {
      failure = demucsFailure(error, 'run')
    }
  }
  throw failure
}
