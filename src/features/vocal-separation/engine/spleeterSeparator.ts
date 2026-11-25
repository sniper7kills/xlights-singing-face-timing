import * as ort from 'onnxruntime-web/wasm'
// The runtime fetches its WASM file from cdn.jsdelivr.net by default, and the CSP blocks that host.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { wasmThreads } from '../../transcription/threads.ts'
import type { StereoAudio } from '../protocol.ts'
import { SeparationFailure } from '../separationFailure.ts'
import type { Separator, SeparatorEvents } from '../separator.ts'
import { magnitudeInput, vocalsMask } from './layout.ts'
import { loadModelFiles } from './modelFiles.ts'
import { addSegment, planSegments } from './segments.ts'
import { SEPARATION_MODEL_FILES, SPLEETER } from './spleeterModel.ts'
import { createStft, type Stft } from './stft.ts'

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
ort.env.wasm.numThreads = wasmThreads(self.crossOriginIsolated, navigator.hardwareConcurrency)

/** The vocals session, then the accompaniment session, in the order of `SEPARATION_MODEL_FILES`. */
type Sessions = readonly ort.InferenceSession[]

// The WASM runtime reports a failed allocation as a C++ `std::bad_alloc`.
const BAD_ALLOC = /bad_alloc/

function sessionFailure(error: unknown): SeparationFailure {
  const detail = `The vocal separation model did not load: ${String(error)}`
  return new SeparationFailure(BAD_ALLOC.test(String(error)) ? 'memory' : 'model', detail)
}

async function createSessions(on: SeparatorEvents): Promise<Sessions> {
  const contents = await loadModelFiles(SEPARATION_MODEL_FILES, on.download, {
    caches: self.caches,
    fetch: (url) => fetch(url),
  })
  const options: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'] }
  const sessions: ort.InferenceSession[] = []
  try {
    // One session at a time, so the runtime holds the copy of one model file at a time.
    for (const content of contents)
      sessions.push(await ort.InferenceSession.create(content, options))
  } catch (error) {
    throw sessionFailure(error)
  }
  return sessions
}

async function runModel(session: ort.InferenceSession, input: ort.Tensor): Promise<Float32Array> {
  const tensor = (await session.run({ [SPLEETER.inputName]: input }))[SPLEETER.outputName]
  if (tensor === undefined || !(tensor.data instanceof Float32Array)) {
    throw new SeparationFailure(
      'model',
      `The model gave no float32 output "${SPLEETER.outputName}".`,
    )
  }
  return tensor.data
}

/** Returns the mono vocals of one segment: the mean of the two masked channels. */
async function separateSegment(
  sessions: Sessions,
  stft: Stft,
  channels: readonly Float32Array[],
): Promise<Float32Array> {
  const spectra = channels.map((channel) => stft.forward(channel))
  const shape = [2, 1, SPLEETER.frames, SPLEETER.modelBins]
  const input = new ort.Tensor('float32', magnitudeInput(spectra, SPLEETER.modelBins), shape)
  const [vocals, accompaniment] = await Promise.all(
    sessions.map((session) => runModel(session, input)),
  )
  if (vocals === undefined || accompaniment === undefined) {
    throw new SeparationFailure('model', 'The vocal separation needs two models.')
  }
  const size = SPLEETER.frames * SPLEETER.modelBins
  const mono = new Float32Array(stft.segmentLength)
  spectra.forEach((spectrum, channel) => {
    const masked = stft.inverse(
      spectrum,
      vocalsMask(vocals, accompaniment, channel, size),
      SPLEETER.modelBins,
    )
    masked.forEach((value, index) => {
      mono[index] = (mono[index] ?? 0) + value / spectra.length
    })
  })
  return mono
}

/** Returns the samples of one channel in one segment, padded with zeros to the full segment length. */
function segmentSamples(
  channel: Float32Array,
  start: number,
  length: number,
  segmentLength: number,
) {
  const samples = new Float32Array(segmentLength)
  samples.set(channel.subarray(start, start + length))
  return samples
}

async function separate(
  sessions: Sessions,
  audio: StereoAudio,
  on: SeparatorEvents,
): Promise<Float32Array> {
  const stft = createStft(SPLEETER)
  const total = audio.left.length
  const toMs = (samples: number) => (samples / audio.sampleRate) * 1000
  const vocals = new Float32Array(total)
  on.progress(0, toMs(total))
  for (const segment of planSegments(total, stft.segmentLength, SPLEETER.overlap)) {
    const channels = [audio.left, audio.right].map((channel) =>
      segmentSamples(channel, segment.start, segment.length, stft.segmentLength),
    )
    addSegment(
      vocals,
      await separateSegment(sessions, stft, channels),
      segment,
      SPLEETER.overlap,
      total,
    )
    on.progress(toMs(segment.start + segment.length), toMs(total))
  }
  return vocals
}

/**
 * Returns the Spleeter engine. It downloads the two model files at the first run and keeps them in the browser cache.
 * The engine reads the audio in segments of about 12 s, so the memory does not grow with the song length.
 */
export function createSpleeterSeparator(): Separator {
  let sessions: Promise<Sessions> | null = null
  return {
    async separate(audio, on) {
      sessions ??= createSessions(on)
      return separate(await sessions, audio, on)
    },
  }
}
