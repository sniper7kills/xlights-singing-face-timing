import type { SeparationModelId } from '../protocol.ts'
import { DEMUCS_MODEL_FILES } from './demucsModel.ts'
import type { ModelFile } from './modelFiles.ts'
import { SEPARATION_MODEL_FILES } from './spleeterModel.ts'

/** One vocal separation model that the person can select. The page imports this list, so it holds no engine code. */
export type SeparationModel = {
  id: SeparationModelId
  /** The product name of the model, as the dialog shows it. */
  name: string
  files: readonly ModelFile[]
}

/** The vocal separation models, the default first. */
export const SEPARATION_MODELS: readonly SeparationModel[] = [
  { id: 'spleeter', name: 'Spleeter', files: SEPARATION_MODEL_FILES },
  { id: 'demucs', name: 'Demucs', files: DEMUCS_MODEL_FILES },
]

/** The model of a run with no stored choice. Issue #122 keeps Spleeter as the default. */
export const DEFAULT_SEPARATION_MODEL: SeparationModelId = 'spleeter'

/** Returns true when the value is the id of a model in `SEPARATION_MODELS`. A stored value can come from another app version. */
export function isSeparationModelId(value: unknown): value is SeparationModelId {
  return SEPARATION_MODELS.some((model) => model.id === value)
}

/**
 * Returns the download size of a model in megabytes (1 MB = 1 000 000 bytes), rounded to a whole number.
 * @param id The id of the model.
 */
export function separationModelMb(id: SeparationModelId): number {
  const files = SEPARATION_MODELS.find((model) => model.id === id)?.files ?? []
  return Math.round(files.reduce((sum, file) => sum + file.bytes, 0) / 1_000_000)
}
