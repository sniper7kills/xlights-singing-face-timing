import { EMBEDDING_MODEL_BYTES, SEGMENTATION_MODEL_BYTES } from './singerModelBytes.ts'

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
  bytes: SEGMENTATION_MODEL_BYTES,
}

/** The WeSpeaker ResNet34 speaker embedding model as ONNX, CC BY 4.0 licence. It gives one embedding of 256 values. */
export const EMBEDDING_MODEL: SingerModel = {
  repo: 'onnx-community/wespeaker-voxceleb-resnet34-LM',
  revision: '6a61a1833ff2583aabeba044f5c8221f00b67ceb',
  bytes: EMBEDDING_MODEL_BYTES,
}

/**
 * A singer with less than this share of the sung time joins the closest other singer.
 * With "Automatic", each singer also holds this share of the embedding time or more.
 * On the song of issue #137, the chorus held 22% and a split of one solo voice held 4%, so the value stays. See ADR 0009.
 */
export const MIN_SINGER_SHARE = 0.05

/** A singer with less sung time than this, in milliseconds, joins the closest other singer. NOT tuned on songs. */
export const MIN_SINGER_MS = 3000

/**
 * The settings of the diarization, at the 16 000 Hz of the input.
 * The window is the 10 s that the segmentation model reads. The clustering values are those of the
 * pyannote.audio 3.1 pipeline (`tutorials/community/offline_usage_speaker_diarization.ipynb`), which is tuned on speech.
 * The threshold applies to the centroids of the large groups. On the song of issue #137, the centroids of the man and the chorus were 0.764 apart.
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
  minSingerShare: MIN_SINGER_SHARE,
  minSingerMs: MIN_SINGER_MS,
  minGapMs: 300,
  minRangeMs: 300,
} as const
