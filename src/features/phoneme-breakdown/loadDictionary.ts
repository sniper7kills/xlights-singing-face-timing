import type { Dictionary } from '../../lib/dictionary/types.ts'

// The file is not in the entry chunk, because it is 3.8 MB before compression.
const DICTIONARY_PATH = 'dict/cmudict.json'

/** The dictionary file did not load. The message states the cause and the next action. */
export class DictionaryLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super('The dictionary did not load. Check the connection and retry.', options)
    this.name = 'DictionaryLoadError'
  }
}

let request: Promise<Dictionary> | undefined
let loaded: Dictionary | undefined

async function fetchDictionary(): Promise<Dictionary> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${DICTIONARY_PATH}`)
    if (!response.ok) throw new Error(`${DICTIONARY_PATH}: HTTP ${response.status}`)
    loaded = (await response.json()) as Dictionary
    return loaded
  } catch (cause) {
    throw new DictionaryLoadError({ cause })
  }
}

/**
 * Returns the dictionary. The first call requests the file; later calls get the same promise.
 * After a failure, the next call requests the file again, so that the person can retry.
 * Rejects with DictionaryLoadError when the file does not load.
 */
export function loadDictionary(): Promise<Dictionary> {
  request ??= fetchDictionary().catch((error: unknown) => {
    request = undefined
    throw error
  })
  return request
}

/**
 * Returns the dictionary when a request has loaded it, or undefined before that.
 * A store action that cannot wait for the file reads it here.
 */
export function loadedDictionary(): Dictionary | undefined {
  return loaded
}
