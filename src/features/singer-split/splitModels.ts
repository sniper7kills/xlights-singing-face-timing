import type { SingerTrackLabel, SplitMode } from '../../lib/singers/splitRules.ts'

/**
 * One singer split model file and the facts of its graph, from the contract of issue #191.
 * The page imports this table for the download size, so it holds no engine code.
 */
export type SplitModel = {
  /** The file name in the folder `models/` of the site. */
  fileName: string
  /** The size of the file. A download with another size fails. */
  bytes: number
  /** The SHA-256 of the file, in lower-case hexadecimal. A download with another hash fails. */
  sha256: string
  /** The samples of one chunk at 44 100 Hz. The graph has a fixed shape, so each chunk has this length. */
  chunkSamples: number
  /** The STFT frames of one chunk: `chunkSamples / 441 + 1`. */
  frames: number
  /** The label of output stem 0, then of output stem 1. */
  stems: readonly [SingerTrackLabel, SingerTrackLabel]
}

/**
 * The model file of each split mode.
 * The files are float16 exports of the RoFormer checkpoints of `docs/external.md`, with the STFT outside the graph.
 */
export const SPLIT_MODELS: Readonly<Record<SplitMode, SplitModel>> = {
  'male-female': {
    fileName: 'bs_roformer_male_female_aufr33.v2.w16.onnx',
    bytes: 266_945_164,
    sha256: 'da41d39969d2282c8bf1ce746f85fa01fb064666f1c0925b893d2447aaddd700',
    chunkSamples: 352_800,
    frames: 801,
    stems: ['male', 'female'],
  },
  'lead-backing': {
    fileName: 'mel_band_roformer_karaoke_becruily.v2.w16.onnx',
    bytes: 864_108_113,
    sha256: '0ee3f23372e832f74a6aac430684d690ccae2e645137296295ae60afc113eefb',
    chunkSamples: 485_100,
    frames: 1101,
    stems: ['lead', 'backing'],
  },
}

/**
 * Returns the URL of a model file: the folder `models/` under the base of the app.
 * A worker resolves a relative URL against the URL of its own script, so the function gives an absolute URL.
 * @param fileName The file name from `SPLIT_MODELS`.
 * @param origin The origin of the app, for example `self.location.origin`.
 * @param base The base path of the app, `import.meta.env.BASE_URL` in the app.
 */
export function splitModelUrl(fileName: string, origin: string, base: string): string {
  return new URL(`${base}models/${fileName}`, origin).href
}

/**
 * Returns the download size of the model of a mode in megabytes (1 MB = 1 000 000 bytes), rounded to a whole number.
 * @param mode The split mode.
 */
export function splitModelMb(mode: SplitMode): number {
  return Math.round(SPLIT_MODELS[mode].bytes / 1_000_000)
}
