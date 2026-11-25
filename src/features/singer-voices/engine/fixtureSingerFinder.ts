import { finalSingers, type SingerDiagnostics } from '../../../lib/singers/diagnostics.ts'
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
 * Returns the segments of singers who take turns, one equal part of the vocals each, in the order of their numbers.
 * Two adjacent singers both sing for `FIXTURE_OVERLAP_MS` at the border of their parts.
 * @param totalMs The length of the vocals.
 * @param singerCount The count of singers. Default 2.
 */
export function fixtureSegments(totalMs: number, singerCount = 2): SingerSegment[] {
  const half = FIXTURE_OVERLAP_MS / 2
  return Array.from({ length: singerCount }, (_, singer) => ({
    startMs: singer === 0 ? 0 : Math.max(0, Math.round((totalMs * singer) / singerCount) - half),
    endMs: Math.min(totalMs, Math.round((totalMs * (singer + 1)) / singerCount) + half),
    singer,
  }))
}

/**
 * Returns plausible diagnostics for the segments of `fixtureSegments`: three raw groups, and a short third group that joins singer 0.
 * @param totalMs The length of the vocals.
 * @param segments The segments that the fixture returns.
 */
export function fixtureDiagnostics(totalMs: number, segments: SingerSegment[]): SingerDiagnostics {
  const singers = finalSingers(segments)
  const firstMs = singers[0]?.sungMs ?? 0
  return {
    audioMs: totalMs,
    windowCount: Math.max(1, Math.ceil(totalMs / 1000)),
    framesWithSpeech: Math.round(totalMs / 17),
    sungMs: totalMs,
    embeddingCount: 7,
    droppedEmbeddings: 0,
    settings: {
      threshold: 0.7,
      minGroupSize: 1,
      maxSingers: 12,
      minSingerShare: 0.05,
      minSingerMs: 3000,
    },
    rawGroupCount: 3,
    rawGroups: [
      { group: 0, sungMs: firstMs, embeddingCount: 3, fate: { kind: 'kept', singer: 0 } },
      {
        group: 1,
        sungMs: singers[1]?.sungMs ?? 0,
        embeddingCount: 3,
        fate: { kind: 'kept', singer: 1 },
      },
      {
        group: 2,
        sungMs: 400,
        embeddingCount: 1,
        fate: { kind: 'joined', into: 0, reason: 'time' },
      },
    ],
    centroidDistances: { min: 0.52, median: 0.81, max: 1.1 },
    finalSingerCount: singers.length,
    singers,
  }
}

/**
 * Returns an engine for the tests that downloads no model.
 * It sends a short download and the progress of about one second, and then returns the segments of `fixtureSegments` for the given count.
 */
export function createFixtureSingerFinder(): SingerFinder {
  return {
    async find(vocals: Float32Array, on: SingerFinderEvents, singerCount?: number) {
      for (const share of [0, 0.5, 1]) {
        on.download(share * FIXTURE_TOTAL_BYTES, FIXTURE_TOTAL_BYTES)
        await wait(DOWNLOAD_STEP_MS)
      }
      const totalMs = Math.round((vocals.length / SAMPLE_RATE) * 1000)
      for (let step = 0; step <= PROGRESS_STEPS; step++) {
        on.progress((totalMs * step) / PROGRESS_STEPS, totalMs)
        if (step < PROGRESS_STEPS) await wait(PROGRESS_STEP_MS)
      }
      const segments = fixtureSegments(totalMs, singerCount)
      on.diagnostics?.(fixtureDiagnostics(totalMs, segments))
      return segments
    },
  }
}
