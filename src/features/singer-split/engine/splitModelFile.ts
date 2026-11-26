import {
  type DownloadEnvironment,
  loadModelFiles,
} from '../../vocal-separation/engine/modelFiles.ts'
import { SeparationFailure } from '../../vocal-separation/separationFailure.ts'
import { SplitFailure } from '../splitFailure.ts'
import { type SplitModel, splitModelUrl } from '../splitModels.ts'

/** The cache of the singer split model files. A new name makes each browser download the files again. */
export const SPLIT_MODEL_CACHE = 'singer-split-models-v1'

/** The site and the browser functions of one model download. Tests replace them. */
export type SplitModelSource = Omit<DownloadEnvironment, 'cacheName'> & {
  /** The origin of the app, for example `self.location.origin`. */
  origin: string
  /** The base path of the app, `import.meta.env.BASE_URL` in the app. */
  base: string
}

/**
 * Returns the contents of the model file of a mode, from the browser cache or from `models/` on the site.
 * The download has the size check, the SHA-256 check and the Cache API of the vocal separation.
 * A file goes into the cache only after both checks pass.
 * @param model The model of the mode.
 * @param onDownload Receives the downloaded bytes and the size of the file. A cache hit calls it never.
 * @param source The site, the cache storage and the `fetch` function.
 * Rejects with a `SplitFailure` of kind 'download' for each failure of the download or of a check,
 * and of kind 'memory' when the browser cannot give the buffer of the file.
 */
export async function loadSplitModel(
  model: SplitModel,
  onDownload: (loadedBytes: number, totalBytes: number) => void,
  source: SplitModelSource,
): Promise<ArrayBuffer> {
  const file = {
    url: splitModelUrl(model.fileName, source.origin, source.base),
    bytes: model.bytes,
    sha256: model.sha256,
  }
  const [contents] = await loadModelFiles([file], onDownload, {
    caches: source.caches,
    fetch: source.fetch,
    cacheName: SPLIT_MODEL_CACHE,
  }).catch((error: unknown) => {
    // A buffer that the browser cannot give is a memory failure, so the dialog shows the memory message.
    const kind = error instanceof SeparationFailure && error.kind === 'memory' ? 'memory' : 'download'
    throw new SplitFailure(kind, error instanceof Error ? error.message : String(error))
  })
  if (contents === undefined) throw new SplitFailure('download', `${file.url} gave no contents.`)
  return contents
}
