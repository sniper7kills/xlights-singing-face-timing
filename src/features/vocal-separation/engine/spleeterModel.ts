import type { ModelFile } from './modelFiles.ts'

/**
 * The Spleeter 2-stem model of Deezer, as the ONNX export of sherpa-onnx.
 * The URLs name a fixed commit, so a change on the host cannot change the model.
 * See docs/adr/0008-vocal-separation-in-the-browser.md.
 */
const REPOSITORY =
  'https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems/resolve/7001ba316a615cacddb3f9ef3ec416661a277e26'

/** The vocals model, then the accompaniment model. The mask of the vocals needs the output of both. */
export const SEPARATION_MODEL_FILES: readonly ModelFile[] = [
  { url: `${REPOSITORY}/vocals.onnx`, bytes: 39_318_336 },
  { url: `${REPOSITORY}/accompaniment.onnx`, bytes: 39_318_343 },
]

/** The download size of the vocal separation model, in bytes. The dialog shows it before the first use. */
export const SEPARATION_MODEL_BYTES = SEPARATION_MODEL_FILES.reduce(
  (sum, file) => sum + file.bytes,
  0,
)

/**
 * The settings of the Spleeter model.
 * The model reads the magnitude of 512 frames and the first 1024 bins of a 4096-point FFT, with a hop of 1024 samples.
 * Source: `scripts/spleeter/export_onnx.py` and `offline-source-separation-spleeter-model-meta-data.h` of sherpa-onnx.
 */
export const SPLEETER = {
  fftSize: 4096,
  hop: 1024,
  frames: 512,
  modelBins: 1024,
  /** 32 hops, about 0.74 s. The cross-fade hides the edge of each segment, where the window sum is small. */
  overlap: 32 * 1024,
  inputName: 'x',
  outputName: 'y',
} as const
