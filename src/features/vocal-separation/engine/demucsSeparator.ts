import { DemucsProcessor } from 'demucs-web'
// The `webgpu` build has the `webgpu` and the `wasm` devices. The `wasm` build has no `webgpu` device.
import * as ort from 'onnxruntime-web/webgpu'
// The `webgpu` build loads the `asyncify` WASM file, and the CSP blocks its default host cdn.jsdelivr.net.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { hasWebGpu } from '../../transcription/device.ts'
import { wasmThreads } from '../../transcription/threads.ts'
import { SeparationFailure } from '../separationFailure.ts'
import type { Separator } from '../separator.ts'
import { DEMUCS_MODEL_FILES } from './demucsModel.ts'
import { demucsDevices, runDemucs } from './demucsRun.ts'
import { loadModelFiles } from './modelFiles.ts'

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
ort.env.wasm.numThreads = wasmThreads(self.crossOriginIsolated, navigator.hardwareConcurrency)

/**
 * Returns the Demucs engine. It downloads the model file at the first run and keeps it in the browser cache.
 * The engine uses the `webgpu` device when the worker gets a WebGPU adapter, and `wasm` after a `webgpu` failure.
 * Nobody ran this engine in the built app before issue #122 merged. It follows the calls of the #117 measurement.
 */
export function createDemucsSeparator(): Separator {
  return {
    async separate(audio, on) {
      const [model] = await loadModelFiles(DEMUCS_MODEL_FILES, on.download, {
        caches: self.caches,
        fetch: (url) => fetch(url),
      })
      if (model === undefined) throw new SeparationFailure('model', 'The Demucs model has no file.')
      const devices = demucsDevices(await hasWebGpu())
      return runDemucs(model, audio, on, devices, (device, onSegment) => {
        return new DemucsProcessor({
          ort,
          sessionOptions: { executionProviders: [device] },
          onProgress: (info) => onSegment(info.currentSegment),
        })
      })
    },
  }
}
