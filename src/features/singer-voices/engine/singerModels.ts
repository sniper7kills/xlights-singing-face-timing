/** One model of the singer search on the Hugging Face Hub. */
export interface SingerModel {
  repo: string
  /** A fixed commit, so a change in the repository cannot change the model. */
  revision: string
  /** The size of `onnx/model.onnx` at the commit. */
  bytes: number
}

/**
 * The pyannote segmentation 3.0 model as ONNX, MIT licence.
 * It finds up to 3 speakers in a 10 s window. See docs/adr/0009-singer-voices-from-diarization.md.
 */
export const SEGMENTATION_MODEL: SingerModel = {
  repo: 'onnx-community/pyannote-segmentation-3.0',
  revision: '733a93b6473d019a773298e08cefa686894b1854',
  bytes: 5_986_908,
}

/** The WeSpeaker ResNet34 speaker embedding model as ONNX, CC BY 4.0 licence. It gives one embedding of 256 values. */
export const EMBEDDING_MODEL: SingerModel = {
  repo: 'onnx-community/wespeaker-voxceleb-resnet34-LM',
  revision: '6a61a1833ff2583aabeba044f5c8221f00b67ceb',
  bytes: 26_535_549,
}

/** The download size of the two singer models, in bytes. The small JSON files of each model are not included. */
export const SINGER_MODEL_BYTES = SEGMENTATION_MODEL.bytes + EMBEDDING_MODEL.bytes

/**
 * The settings of the diarization, at the 16 000 Hz of the input.
 * The window is the 10 s that the segmentation model reads. The clustering values are those of the
 * pyannote.audio 3.1 pipeline (`tutorials/community/offline_usage_speaker_diarization.ipynb`), which is tuned on speech.
 */
export const DIARIZE_SETTINGS = {
  sampleRate: 16_000,
  windowSamples: 160_000,
  // Each frame is in two windows, so a wrong decision of one window does not decide alone.
  stepSamples: 80_000,
  minEmbedSamples: 16_000,
  threshold: 0.7045654963945799,
  minGroupSize: 12,
  // A song has 12 voices at most.
  maxSingers: 12,
  minGapMs: 300,
  minRangeMs: 300,
} as const
