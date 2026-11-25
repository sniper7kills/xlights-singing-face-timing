/** One time range in which one singer sings. The fields match `SingerSegment` of the singers protocol. */
export interface SingerRange {
  startMs: number
  endMs: number
  singer: number
}

/** The settings that turn the frame activity of a singer into time ranges. */
export interface RangeSettings {
  /** The duration of one frame of the activity, in milliseconds. */
  frameMs: number
  /** A gap shorter than this joins the two ranges on each side of it. */
  minGapMs: number
  /** A range shorter than this, after the joins, is dropped. */
  minRangeMs: number
}

function activeRuns(active: ArrayLike<boolean>): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  for (let frame = 0; frame <= active.length; frame++) {
    const on = frame < active.length && active[frame] === true
    if (on && start < 0) start = frame
    if (!on && start >= 0) {
      runs.push([start, frame])
      start = -1
    }
  }
  return runs
}

function joinShortGaps(runs: [number, number][], minGapFrames: number): [number, number][] {
  const joined: [number, number][] = []
  for (const run of runs) {
    const last = joined.at(-1)
    if (last !== undefined && run[0] - last[1] < minGapFrames) last[1] = run[1]
    else joined.push([run[0], run[1]])
  }
  return joined
}

/**
 * Returns the time ranges of one singer from the activity of each frame.
 * Gaps shorter than `minGapMs` are joined first. Then ranges shorter than `minRangeMs` are dropped.
 * @param active True for each frame in which the singer sings.
 * @param singer The number of the singer.
 * @param settings The frame duration and the two limits.
 */
export function activityToRanges(
  active: ArrayLike<boolean>,
  singer: number,
  settings: RangeSettings,
): SingerRange[] {
  const { frameMs, minGapMs, minRangeMs } = settings
  return joinShortGaps(activeRuns(active), minGapMs / frameMs)
    .map(([start, end]) => ({
      startMs: Math.round(start * frameMs),
      endMs: Math.round(end * frameMs),
      singer,
    }))
    .filter((range) => range.endMs - range.startMs >= minRangeMs)
}

/**
 * Returns the ranges sorted by start time, with the singers numbered 0, 1, 2… in the order of their first range.
 * A singer with no range gets no number.
 * @param ranges The ranges of all singers.
 */
export function renumberByFirstRange(ranges: readonly SingerRange[]): SingerRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs || a.singer - b.singer)
  const numbers = new Map<number, number>()
  return sorted.map((range) => {
    if (!numbers.has(range.singer)) numbers.set(range.singer, numbers.size)
    return { ...range, singer: numbers.get(range.singer) ?? 0 }
  })
}
