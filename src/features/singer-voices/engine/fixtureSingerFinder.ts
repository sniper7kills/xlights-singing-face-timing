import type { SingerSegment } from '../protocol.ts'
import type { SingerFinder, SingerFinderEvents } from '../singerFinder.ts'

const SAMPLE_RATE = 16_000
const FIXTURE_TOTAL_BYTES = 3_000_000
const DOWNLOAD_STEP_MS = 50
// A real search takes time, so an E2E test must have time to see the step.
const PROGRESS_STEP_MS = 100
const PROGRESS_STEPS = 10
/** The time in the middle of the vocals in which both fixture singers sing. */
export const FIXTURE_OVERLAP_MS = 500

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

/**
 * Returns the segments of two singers who take turns: singer 0 sings the first half and singer 1 the second half.
 * Both sing for `FIXTURE_OVERLAP_MS` in the middle.
 * @param totalMs The length of the vocals.
 */
export function fixtureSegments(totalMs: number): SingerSegment[] {
  const middleMs = Math.round(totalMs / 2)
  const half = FIXTURE_OVERLAP_MS / 2
  return [
    { startMs: 0, endMs: Math.min(totalMs, middleMs + half), singer: 0 },
    { startMs: Math.max(0, middleMs - half), endMs: totalMs, singer: 1 },
  ]
}

/**
 * Returns an engine for the tests that downloads no model.
 * It sends a short download and the progress of about one second, and then returns the segments of `fixtureSegments`.
 */
export function createFixtureSingerFinder(): SingerFinder {
  return {
    async find(vocals: Float32Array, on: SingerFinderEvents): Promise<SingerSegment[]> {
      for (const share of [0, 0.5, 1]) {
        on.download(share * FIXTURE_TOTAL_BYTES, FIXTURE_TOTAL_BYTES)
        await wait(DOWNLOAD_STEP_MS)
      }
      const totalMs = Math.round((vocals.length / SAMPLE_RATE) * 1000)
      for (let step = 0; step <= PROGRESS_STEPS; step++) {
        on.progress((totalMs * step) / PROGRESS_STEPS, totalMs)
        if (step < PROGRESS_STEPS) await wait(PROGRESS_STEP_MS)
      }
      return fixtureSegments(totalMs)
    },
  }
}
