import {
  AutoFeatureExtractor,
  AutoModel,
  AutoModelForAudioFrameClassification,
  AutoProcessor,
  ModelRegistry,
  env,
  type FeatureExtractor,
  type PreTrainedModel,
  type Processor,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers'
// The library fetches the ONNX runtime from cdn.jsdelivr.net by default, and the CSP blocks that host.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { wasmThreads } from '../../transcription/threads.ts'
import type { SingerFinder, SingerFinderEvents } from '../singerFinder.ts'
import { diarize, type DiarizeModels } from './diarize.ts'
import { loadFailure, runFailure } from './modelFailure.ts'
import {
  DIARIZE_SETTINGS,
  EMBEDDING_MODEL,
  SEGMENTATION_MODEL,
  type SingerModel,
} from './singerModels.ts'
import { SINGER_MODEL_BYTES } from './singerModelBytes.ts'

const onnxWasm = env.backends.onnx.wasm
if (onnxWasm) {
  onnxWasm.wasmPaths = { wasm: ortWasmUrl }
  onnxWasm.numThreads = wasmThreads(self.crossOriginIsolated, navigator.hardwareConcurrency)
}

function loadOptions(model: SingerModel) {
  return { revision: model.revision, dtype: 'fp32', device: 'wasm' } as const
}

/** Returns a progress callback that sums the bytes of the two ONNX files, or none when both models are in the cache. */
async function downloadProgress(
  on: SingerFinderEvents,
): Promise<((info: ProgressInfo) => void) | undefined> {
  const cached = await Promise.all(
    [SEGMENTATION_MODEL, EMBEDDING_MODEL].map((model) =>
      ModelRegistry.is_cached(model.repo, loadOptions(model)).catch(() => false),
    ),
  )
  // The library sends progress events for cached files too, and a cached model shows no download state.
  if (cached.every(Boolean)) return undefined
  const loaded = new Map<string, number>()
  return (info) => {
    if (info.status !== 'progress' || !info.file.endsWith('.onnx')) return
    loaded.set(`${info.name}/${info.file}`, info.loaded)
    on.download(
      [...loaded.values()].reduce((sum, bytes) => sum + bytes, 0),
      SINGER_MODEL_BYTES,
    )
  }
}

interface LoadedModels {
  segmentation: PreTrainedModel
  /** The processor of the segmentation model. The cache check of the library expects its file. */
  windowInput: Processor
  embedding: PreTrainedModel
  features: FeatureExtractor
}

async function loadModels(on: SingerFinderEvents): Promise<LoadedModels> {
  const progress_callback = await downloadProgress(on)
  // One model at a time, so the runtime holds the copy of one model file at a time.
  const segmentation = await AutoModelForAudioFrameClassification.from_pretrained(
    SEGMENTATION_MODEL.repo,
    { ...loadOptions(SEGMENTATION_MODEL), progress_callback },
  )
  const windowInput = await AutoProcessor.from_pretrained(SEGMENTATION_MODEL.repo, {
    revision: SEGMENTATION_MODEL.revision,
  })
  const embedding = await AutoModel.from_pretrained(EMBEDDING_MODEL.repo, {
    ...loadOptions(EMBEDDING_MODEL),
    progress_callback,
  })
  const features = await AutoFeatureExtractor.from_pretrained(EMBEDDING_MODEL.repo, {
    revision: EMBEDDING_MODEL.revision,
  })
  return { segmentation, windowInput, embedding, features }
}

function tensorData(output: Record<string, Tensor>, name: string): Float32Array {
  const data = output[name]?.data
  if (!(data instanceof Float32Array))
    throw new Error(`The model gave no float32 output "${name}".`)
  return data
}

function diarizeModels(models: LoadedModels): DiarizeModels {
  return {
    async segment(window) {
      return tensorData(await models.segmentation(await models.windowInput(window)), 'logits')
    },
    async embed(samples) {
      return tensorData(await models.embedding(await models.features(samples)), 'last_hidden_state')
    },
  }
}

/**
 * Returns the engine that finds the singers with the pyannote segmentation model and the WeSpeaker embedding model.
 * The engine downloads the two models at the first search, through the cache of the library, and keeps them loaded.
 * It reads the vocals in windows of 10 s, so the memory does not grow with the song length.
 * The search rejects with a `SingerFailure`: 'download' or 'model' for a load failure, 'memory' or 'model' for a run failure.
 */
export function createPyannoteSingerFinder(): SingerFinder {
  let models: Promise<LoadedModels> | null = null
  return {
    async find(vocals, on, singerCount) {
      models ??= loadModels(on).catch((error: unknown) => {
        models = null
        throw loadFailure(error)
      })
      const loaded = await models
      const totalMs = (vocals.length / DIARIZE_SETTINGS.sampleRate) * 1000
      on.progress(0, totalMs)
      const settings =
        singerCount === undefined ? DIARIZE_SETTINGS : { ...DIARIZE_SETTINGS, singerCount }
      return diarize(
        vocals,
        diarizeModels(loaded),
        settings,
        (done) => on.progress((done / DIARIZE_SETTINGS.sampleRate) * 1000, totalMs),
        on.diagnostics,
      ).catch((error: unknown) => {
        throw runFailure(error)
      })
    },
  }
}
