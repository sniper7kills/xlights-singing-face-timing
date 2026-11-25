import type { SeparationModelId } from '../protocol.ts'
import type { Separator } from '../separator.ts'
import { createSpleeterSeparator } from './spleeterSeparator.ts'

/**
 * Returns the engine of a model, for `separate.worker.ts`.
 * The worker calls it at the first request, so the thread workers of a WASM runtime make no engine.
 * The Demucs engine and `demucs-web` are a separate chunk, so a Spleeter run does not load them.
 * @param model The model of the request.
 */
export function createSeparator(model: SeparationModelId): Separator {
  if (model === 'spleeter') return createSpleeterSeparator()
  return {
    async separate(audio, on, instruments) {
      const { createDemucsSeparator } = await import('./demucsSeparator.ts')
      return createDemucsSeparator().separate(audio, on, instruments)
    },
  }
}
