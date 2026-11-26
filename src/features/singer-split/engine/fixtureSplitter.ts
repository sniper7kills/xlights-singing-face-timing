import { keepPart, SPLIT_LABELS } from '../../../lib/singers/splitRules.ts'
import type { StereoAudio } from '../../vocal-separation/protocol.ts'
import type { SplitMode, SplitResult } from '../protocol.ts'
import { SplitFailure } from '../splitFailure.ts'
import type { Splitter, SplitterEvents } from '../splitter.ts'

const FIXTURE_TOTAL_BYTES = 3_000_000
const DOWNLOAD_STEP_MS = 50
// A real split takes time, so an E2E test must have time to see the step.
const PROGRESS_STEP_MS = 100
const PROGRESS_STEPS = 10

/**
 * The part of the vocals that each fixture track keeps, from 0 to 1 of the length.
 * The parts have 40% to 60% in common, so the phrases of the two voices overlap in time.
 */
export const FIXTURE_PARTS: readonly (readonly [number, number])[] = [
  [0, 0.6],
  [0.4, 1],
]

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new SplitFailure('unknown', 'The person cancelled the singer split.')
}

function partOf(vocals: StereoAudio, [start, end]: readonly [number, number]): StereoAudio {
  return {
    left: keepPart(vocals.left, start, end),
    right: keepPart(vocals.right, start, end),
    sampleRate: 44100,
  }
}

/**
 * Returns an engine for the tests that downloads no model.
 * It sends a short download and the progress of about one second.
 * The first track keeps the first 60% of the vocals and the second track keeps the last 60%. The rest of each track is 0.
 * The transcribe fixture gives no word where the audio is 0, so each voice gets different words.
 */
export function createFixtureSplitter(): Splitter {
  return {
    async split(
      vocals: StereoAudio,
      mode: SplitMode,
      on: SplitterEvents,
      signal: AbortSignal,
    ): Promise<SplitResult> {
      for (const share of [0, 0.5, 1]) {
        on.download(share * FIXTURE_TOTAL_BYTES, FIXTURE_TOTAL_BYTES)
        await wait(DOWNLOAD_STEP_MS)
      }
      const totalMs = (vocals.left.length / vocals.sampleRate) * 1000
      for (let step = 0; step <= PROGRESS_STEPS; step++) {
        stopIfAborted(signal)
        on.progress((totalMs * step) / PROGRESS_STEPS, totalMs)
        if (step < PROGRESS_STEPS) await wait(PROGRESS_STEP_MS)
      }
      return {
        tracks: SPLIT_LABELS[mode].map((label, index) => ({
          label,
          audio: partOf(vocals, FIXTURE_PARTS[index] ?? [0, 1]),
        })),
      }
    },
  }
}
