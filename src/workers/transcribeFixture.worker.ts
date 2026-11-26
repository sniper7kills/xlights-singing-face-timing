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
// A real run shows each state for a while. The E2E tests must see the elapsed time change before the first progress.
const MODEL_LOAD_DELAY_MS = 300
const FIRST_PROGRESS_DELAY_MS = 1500
// The real worker reports the audio time of each segment, a few seconds apart.
const SEGMENT_MS = 5000

type MarksFile = { marks: { layer: string; label: string; startMs: number; endMs: number }[] }

// The library keeps the speech model files in Cache Storage, so the fixture keeps its mark there too.
const FIXTURE_CACHE = 'transcribe-fixture'

function post(message: FromWorkerMessage): void {
  self.postMessage(message)
}

function wait(delayMs = STEP_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
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
  await wait(MODEL_LOAD_DELAY_MS)
  post({ type: 'ready' })
}

// The singer split fixture sets parts of a track to 0. A resample of 0 gives values near 0, not exactly 0.
const SILENCE_LEVEL = 1e-4

/** Returns true when each sample of the word time is near 0, so the fixture gives no word there. */
function silentAt(
  samples: Float32Array,
  offsetMs: number,
  word: { startMs: number; endMs: number },
) {
  const toIndex = (ms: number) => Math.round(((ms - offsetMs) / 1000) * SPEECH_SAMPLE_RATE)
  return samples
    .subarray(toIndex(word.startMs), toIndex(word.endMs))
    .every((value) => Math.abs(value) < SILENCE_LEVEL)
}

/** Returns the demo song words that lie fully inside the run and that have sound. */
async function fixtureWords(samples: Float32Array, offsetMs: number): Promise<TimedWord[]> {
  const durationMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  const response = await fetch(`${import.meta.env.BASE_URL}demo/silent-night.marks.json`)
  const file = (await response.json()) as MarksFile
  return file.marks
    .filter((mark) => mark.layer === 'word')
    .filter((mark) => mark.startMs >= offsetMs && mark.endMs <= offsetMs + durationMs)
    .filter((mark) => !silentAt(samples, offsetMs, mark))
    .map(({ label, startMs, endMs }) => ({ text: label, startMs, endMs }))
}

async function transcribe(runId: string, samples: Float32Array, offsetMs: number): Promise<void> {
  const durationMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  await wait(FIRST_PROGRESS_DELAY_MS)
  let reachedMs = 0
  for (let chunkIndex = 0; ; chunkIndex++) {
    const chunkDoneMs = doneMsAfterChunk(chunkIndex, samples.length)
    for (let doneMs = reachedMs + SEGMENT_MS; doneMs < chunkDoneMs; doneMs += SEGMENT_MS) {
      post({ type: 'progress', runId, doneMs })
      await wait()
    }
    post({ type: 'progress', runId, doneMs: chunkDoneMs })
    reachedMs = chunkDoneMs
    if (chunkDoneMs >= durationMs) break
    await wait()
  }
  post({ type: 'result', runId, words: await fixtureWords(samples, offsetMs) })
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
