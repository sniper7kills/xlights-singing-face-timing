import type { ModelFile } from './modelFiles.ts'

/**
 * The `htdemucs` model of Demucs, as the ONNX export of `demucs-web` with the STFT outside the graph.
 * The URL names a fixed commit, so a change on the host cannot change the model.
 * See docs/adr/0008-vocal-separation-in-the-browser.md.
 */
const REPOSITORY =
  'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d'

/** The one file of the Demucs model. The size is the `lfs.size` of the Hugging Face Hub API for this commit. */
export const DEMUCS_MODEL_FILES: readonly ModelFile[] = [
  { url: `${REPOSITORY}/htdemucs_embedded.onnx`, bytes: 180_534_758 },
]

/** The SHA-256 of `htdemucs_embedded.onnx`: the `lfs.oid` of the Hugging Face Hub API for this commit. */
export const DEMUCS_MODEL_SHA256 =
  'e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077'

/**
 * The segment settings of `DemucsProcessor.separate` in `demucs-web` 1.0.2, from its `src/constants.js`.
 * The package reports progress as a segment count, and the engine converts the count to audio time with these values.
 */
export const DEMUCS = {
  /** The samples of one segment, about 7.8 s at 44 100 Hz. */
  segmentSamples: 343_980,
  /** The segments overlap by a quarter. */
  overlap: 0.25,
} as const
