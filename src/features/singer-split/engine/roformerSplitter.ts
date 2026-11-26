// The `webgpu` build has the `webgpu` device. The engine asks for no other device, because a model of this size is not usable on `wasm`.
import * as ort from 'onnxruntime-web/webgpu'
// The `webgpu` build loads the `asyncify` WASM file, and the CSP blocks its default host cdn.jsdelivr.net.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { wasmThreads } from '../../transcription/threads.ts'
import type { Splitter } from '../splitter.ts'
import { SPLIT_MODELS } from '../splitModels.ts'
import { runRoformerSplit, type SplitRuntime } from './roformerRun.ts'
import { loadSplitModel } from './splitModelFile.ts'

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
ort.env.wasm.numThreads = wasmThreads(self.crossOriginIsolated, navigator.hardwareConcurrency)

const runtime: SplitRuntime<ort.Tensor> = {
  loadModel: (model, onDownload) =>
    loadSplitModel(model, onDownload, {
      caches: self.caches,
      fetch: (url) => fetch(url),
      origin: self.location.origin,
      base: import.meta.env.BASE_URL,
    }),
  createSession: (contents) =>
    ort.InferenceSession.create(contents, { executionProviders: ['webgpu'] }),
  tensor: (data, dims) => new ort.Tensor('float32', data, dims),
}

/**
 * Returns the RoFormer engine of the singer split. It runs the model of the mode with ONNX Runtime Web on WebGPU.
 * Each run starts a new session and releases it at the end, so the GPU memory of the model goes back to the browser.
 */
export function createRoformerSplitter(): Splitter {
  return {
    split: (vocals, mode, on, signal) =>
      runRoformerSplit(runtime, SPLIT_MODELS[mode], vocals, mode, on, signal),
  }
}
