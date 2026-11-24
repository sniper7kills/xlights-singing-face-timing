// The E2E tests use this worker in place of transcribe.worker.ts, so that no test downloads a speech model.
// The client starts it only when `__TRANSCRIBE_FIXTURE__` is true.
import {
  SPEECH_SAMPLE_RATE,
  doneMsAfterChunk,
  type FromWorkerMessage,
  type ToWorkerMessage,
} from '../features/transcription/protocol.ts'
import type { TimedWord } from '../features/transcription/types.ts'

const FIXTURE_TOTAL_BYTES = 1_000_000
const STEP_DELAY_MS = 50

type MarksFile = { marks: { layer: string; label: string; startMs: number; endMs: number }[] }

// The library keeps the speech model files in Cache Storage, so the fixture keeps its mark there too.
const FIXTURE_CACHE = 'transcribe-fixture'

function post(message: FromWorkerMessage): void {
  self.postMessage(message)
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS))
}

async function load(speechModelId: string): Promise<void> {
  const cache = await caches.open(FIXTURE_CACHE)
  const key = `/${speechModelId}`
  if ((await cache.match(key)) === undefined) {
    for (const share of [0, 0.5, 1]) {
      post({
        type: 'download',
        loadedBytes: share * FIXTURE_TOTAL_BYTES,
        totalBytes: FIXTURE_TOTAL_BYTES,
      })
      await wait()
    }
    await cache.put(key, new Response(''))
  }
  post({ type: 'ready' })
}

/** Returns the demo song words that lie fully inside the run. */
async function fixtureWords(offsetMs: number, durationMs: number): Promise<TimedWord[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo/silent-night.marks.json`)
  const file = (await response.json()) as MarksFile
  return file.marks
    .filter((mark) => mark.layer === 'word')
    .filter((mark) => mark.startMs >= offsetMs && mark.endMs <= offsetMs + durationMs)
    .map(({ label, startMs, endMs }) => ({ text: label, startMs, endMs }))
}

async function transcribe(runId: string, samples: Float32Array, offsetMs: number): Promise<void> {
  const durationMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  for (let chunkIndex = 0; ; chunkIndex++) {
    await wait()
    const doneMs = doneMsAfterChunk(chunkIndex, samples.length)
    post({ type: 'progress', runId, doneMs })
    if (doneMs >= durationMs) break
  }
  post({ type: 'result', runId, words: await fixtureWords(offsetMs, durationMs) })
}

self.addEventListener('message', (event: MessageEvent<ToWorkerMessage>) => {
  const message = event.data
  const done =
    message.type === 'load'
      ? load(message.speechModelId)
      : transcribe(message.runId, message.samples, message.offsetMs)
  done.catch((error: unknown) => {
    const runId = message.type === 'transcribe' ? message.runId : undefined
    post({ type: 'error', runId, kind: 'unknown', detail: String(error) })
  })
})
