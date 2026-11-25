import {
  type DiagnosticSettings,
  distanceSummary,
  finalSingers,
  groupFates,
  type SingerDiagnostics,
} from '../../../lib/singers/diagnostics.ts'
import { type ClusterStages, clusterStages, foldShortGroups, NO_GROUP } from './clustering.ts'
import { decodePowerset } from './powerset.ts'
import type { SingerSegment } from '../protocol.ts'
import { activityToRanges, firstRangeNumbers, renumberByFirstRange } from './segments.ts'
import { planWindows, windowSamplesAt } from './windows.ts'

/** The two models that the diarization calls. Tests replace them. */
export interface DiarizeModels {
  /** Returns the 7 class scores of each frame of one window, frame after frame. */
  segment(window: Float32Array): Promise<Float32Array>
  /** Returns the speaker embedding of the samples. */
  embed(samples: Float32Array): Promise<Float32Array>
}

/** The settings of the diarization. All counts are in samples of the input. */
export interface DiarizeSettings {
  sampleRate: number
  windowSamples: number
  stepSamples: number
  /** A local speaker with fewer samples than this gets no embedding, and its frames count for no singer. */
  minEmbedSamples: number
  /** The merge threshold of the clustering: a distance between the centroids of unit-length embeddings. */
  threshold: number
  /** A group with fewer local speakers than this joins the closest larger group. */
  minGroupSize: number
  maxSingers: number
  /** A singer with less sung time than this share of all sung time joins the closest other singer. */
  minSingerShare: number
  /** A singer with less sung time than this joins the closest other singer, whatever the share. */
  minSingerMs: number
  minGapMs: number
  minRangeMs: number
  /** The count of singers that the person gives. With a count, the threshold and the rule for short singers do not apply. */
  singerCount?: number
}

/** One speaker of one window, with its frames and its embedding. */
interface LocalSpeaker {
  windowStart: number
  activity: Uint8Array
  embedding: Float32Array
  /** The samples that the embedding model read. */
  samples: number
}

/** Returns the samples of the frames that are set, in order. */
function framesSamples(
  window: Float32Array,
  frames: readonly boolean[],
  frameSamples: number,
): Float32Array {
  const parts = frames.flatMap((on, frame) =>
    on
      ? [window.subarray(Math.round(frame * frameSamples), Math.round((frame + 1) * frameSamples))]
      : [],
  )
  const samples = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    samples.set(part, offset)
    offset += part.length
  }
  return samples
}

/**
 * Returns the samples for the embedding of one local speaker: the frames in which it sings alone, as pyannote.audio does.
 * If those are too short, the frames in which it sings with another speaker count too.
 */
function speakerSamples(
  window: Float32Array,
  activity: readonly Uint8Array[],
  speaker: Uint8Array,
  frameSamples: number,
  minEmbedSamples: number,
): Float32Array {
  const alone = Array.from(
    speaker,
    (on, frame) => on === 1 && activity.every((other) => other === speaker || other[frame] === 0),
  )
  const aloneSamples = framesSamples(window, alone, frameSamples)
  if (aloneSamples.length >= minEmbedSamples) return aloneSamples
  return framesSamples(
    window,
    Array.from(speaker, (on) => on === 1),
    frameSamples,
  )
}

async function windowSpeakers(
  window: Float32Array,
  windowStart: number,
  models: DiarizeModels,
  settings: DiarizeSettings,
): Promise<LocalSpeaker[]> {
  const activity = decodePowerset(await models.segment(window))
  const frameSamples = settings.windowSamples / (activity[0]?.length ?? 1)
  const speakers: LocalSpeaker[] = []
  for (const speaker of activity) {
    const samples = speakerSamples(
      window,
      activity,
      speaker,
      frameSamples,
      settings.minEmbedSamples,
    )
    if (samples.length >= settings.minEmbedSamples) {
      speakers.push({
        windowStart,
        activity: speaker,
        embedding: await models.embed(samples),
        samples: samples.length,
      })
    }
  }
  return speakers
}

/** The frame grid of the whole input. It starts at sample 0 and has the frame duration of the model. */
interface Grid {
  frameSamples: number
  frames: number
  /** The frames of one window. */
  windowFrames: number
}

function gridIndex(grid: Grid, windowStart: number, frame: number): number {
  return Math.round(windowStart / grid.frameSamples) + frame
}

/**
 * Returns, for each singer, the share of the windows over each grid frame that give the frame to the singer.
 * A share of 1 means that every window over the frame hears the singer.
 */
function singerShares(
  speakers: readonly LocalSpeaker[],
  singers: readonly number[],
  windowStarts: readonly number[],
  grid: Grid,
): Float32Array[] {
  const coverage = new Float32Array(grid.frames)
  for (const start of windowStarts) {
    const first = gridIndex(grid, start, 0)
    coverage.subarray(first, first + grid.windowFrames).forEach((_, offset, part) => {
      part[offset] = (part[offset] ?? 0) + 1
    })
  }
  const votes = Array.from(
    { length: Math.max(...singers) + 1 },
    () => new Float32Array(grid.frames),
  )
  speakers.forEach((speaker, index) => {
    const singerVotes = votes[singers[index] ?? 0] ?? new Float32Array()
    const first = gridIndex(grid, speaker.windowStart, 0)
    speaker.activity.forEach((on, frame) => {
      if (on === 1) singerVotes[first + frame] = (singerVotes[first + frame] ?? 0) + 1
    })
  })
  return votes.map((singerVotes) =>
    singerVotes.map((value, frame) => value / Math.max(1, coverage[frame] ?? 0)),
  )
}

/** The facts of one search that `searchDiagnostics` needs, besides the settings. */
interface SearchFacts {
  audioMs: number
  windowCount: number
  embeddingCount: number
  stages: ClusterStages
}

/** Returns the diagnostics of a search that found no speaker with a finite embedding. */
function emptyDiagnostics(facts: SearchFacts, settings: DiarizeSettings): SingerDiagnostics {
  return {
    audioMs: Math.round(facts.audioMs),
    windowCount: facts.windowCount,
    framesWithSpeech: 0,
    sungMs: 0,
    embeddingCount: facts.embeddingCount,
    droppedEmbeddings: facts.embeddingCount,
    settings: settingsInForce(settings, facts.stages),
    rawGroupCount: 0,
    rawGroups: [],
    centroidDistances: null,
    finalSingerCount: 0,
    singers: [],
  }
}

function settingsInForce(settings: DiarizeSettings, stages: ClusterStages): DiagnosticSettings {
  return {
    threshold: settings.threshold,
    minGroupSize: stages.minGroupSize,
    maxSingers: settings.maxSingers,
    minSingerShare: settings.minSingerShare,
    minSingerMs: settings.minSingerMs,
  }
}

/**
 * Returns the time ranges in which each singer sings, sorted by start, with singers numbered in the order of their first range.
 * The segmentation model reads overlapping windows and finds up to 3 local speakers in each.
 * The embedding model and the clustering give the same singer number to the same voice in all windows.
 * A frame belongs to a singer when at least half of the windows over it give it to that singer.
 * Then a singer with too little sung time joins the closest other singer. This limits the singers that a split of one voice can add.
 * @param vocals The audio, mono, at `settings.sampleRate`.
 * @param models The segmentation model and the embedding model.
 * @param settings The window plan, the clustering and the range limits.
 * @param onProgress Called after each window with the samples done and the total samples.
 * @param onDiagnostics Receives the numbers of the search before the function resolves. The numbers cost no model call.
 * Rejects with the error of a model call.
 */
export async function diarize(
  vocals: Float32Array,
  models: DiarizeModels,
  settings: DiarizeSettings,
  onProgress: (doneSamples: number, totalSamples: number) => void,
  onDiagnostics: (diagnostics: SingerDiagnostics) => void = () => undefined,
): Promise<SingerSegment[]> {
  const starts = planWindows(vocals.length, settings.windowSamples, settings.stepSamples)
  const found: LocalSpeaker[] = []
  for (const start of starts) {
    const window = windowSamplesAt(vocals, start, settings.windowSamples)
    found.push(...(await windowSpeakers(window, start, models, settings)))
    onProgress(Math.min(vocals.length, start + settings.windowSamples), vocals.length)
  }
  const stages = clusterStages(
    found.map((speaker) => speaker.embedding),
    found.map((speaker) => speaker.samples),
    {
      threshold: settings.threshold,
      minGroupSize: settings.minGroupSize,
      maxGroups: settings.maxSingers,
      minShare: settings.minSingerShare,
    },
    settings.singerCount,
  )
  const facts: SearchFacts = {
    audioMs: (vocals.length / settings.sampleRate) * 1000,
    windowCount: starts.length,
    embeddingCount: found.length,
    stages,
  }
  // A speaker with an embedding that is not finite has no group, so its frames count for no singer, as silence does.
  const kept = found.map((_, index) => stages.capped[index] !== NO_GROUP)
  const speakers = found.filter((_, index) => kept[index])
  const first = speakers[0]
  if (first === undefined) {
    onDiagnostics(emptyDiagnostics(facts, settings))
    return []
  }
  const frameSamples = settings.windowSamples / first.activity.length
  const search: Search = {
    speakers,
    starts,
    grid: {
      frameSamples,
      frames: Math.ceil(vocals.length / frameSamples),
      windowFrames: first.activity.length,
    },
    frameMs: (frameSamples / settings.sampleRate) * 1000,
    stages: keptStages(stages, kept),
  }
  const result = foldAndRange(search, settings)
  onDiagnostics(searchDiagnostics(facts, search, result, settings))
  return result.segments
}

/** The speakers with a finite embedding and the frame grid of one search. */
interface Search {
  speakers: LocalSpeaker[]
  starts: readonly number[]
  grid: Grid
  frameMs: number
  /** The group of each speaker of `speakers` after each step of the clustering. */
  stages: Omit<ClusterStages, 'mergedDistances' | 'minGroupSize'>
}

/** The result of the join of short singers and of the range limits. */
interface SearchResult {
  /** The group of each speaker after the join of short singers. */
  folded: number[]
  /** The ranges with the numbers of the folded groups. */
  ranges: SingerSegment[]
  segments: SingerSegment[]
  sungFrames: number
  foldReason: 'share' | 'time'
}

function keptStages(stages: ClusterStages, kept: readonly boolean[]): Search['stages'] {
  const pick = (owners: readonly number[]) => owners.filter((_, index) => kept[index])
  return {
    merged: pick(stages.merged),
    joinedSmall: pick(stages.joinedSmall),
    capped: pick(stages.capped),
  }
}

/** Returns, for each group, true for each frame that the group sings, from the group of each speaker. */
function groupActivity(search: Search, owners: readonly number[]): boolean[][] {
  return singerActivity(singerShares(search.speakers, owners, search.starts, search.grid))
}

/** Joins each short singer into the closest other singer, and returns the ranges of the singers that remain. */
function foldAndRange(search: Search, settings: DiarizeSettings): SearchResult {
  const singers = search.stages.capped
  const active = groupActivity(search, singers)
  const sungFrames = countSungFrames(active)
  const shareMs = settings.minSingerShare * sungFrames * search.frameMs
  // A count of the person is a fact, so no group joins another for its short time.
  const folded =
    settings.singerCount !== undefined
      ? singers
      : foldShortGroups(
          singers,
          search.speakers.map((speaker) => speaker.embedding),
          active.map((frames) => frames.filter(Boolean).length * search.frameMs),
          Math.max(shareMs, settings.minSingerMs),
        )
  const rangeSettings = {
    frameMs: search.frameMs,
    minGapMs: settings.minGapMs,
    minRangeMs: settings.minRangeMs,
  }
  const ranges = groupActivity(search, folded).flatMap((frames, singer) =>
    activityToRanges(frames, singer, rangeSettings),
  )
  return {
    folded,
    ranges,
    segments: renumberByFirstRange(ranges),
    sungFrames,
    foldReason: shareMs >= settings.minSingerMs ? 'share' : 'time',
  }
}

/** Returns the numbers of a search: the raw groups, what happened to each, and the singers of the result. */
function searchDiagnostics(
  facts: SearchFacts,
  search: Search,
  result: SearchResult,
  settings: DiarizeSettings,
): SingerDiagnostics {
  const rawSungMs = groupActivity(search, search.stages.merged).map(
    (frames) => frames.filter(Boolean).length * search.frameMs,
  )
  const numbers = firstRangeNumbers(result.ranges)
  const rawGroups = groupFates(
    { ...search.stages, folded: result.folded },
    rawSungMs,
    (folded) => numbers.get(folded),
    result.foldReason,
  )
  const singers = finalSingers(result.segments)
  return {
    audioMs: Math.round(facts.audioMs),
    windowCount: facts.windowCount,
    framesWithSpeech: result.sungFrames,
    sungMs: Math.round(result.sungFrames * search.frameMs),
    embeddingCount: facts.embeddingCount,
    droppedEmbeddings: facts.embeddingCount - search.speakers.length,
    settings: settingsInForce(settings, facts.stages),
    rawGroupCount: rawGroups.length,
    rawGroups,
    centroidDistances: distanceSummary(facts.stages.mergedDistances),
    finalSingerCount: singers.length,
    singers,
  }
}

/** Returns, for each singer, true for each frame that at least half of the windows over it give to the singer. */
function singerActivity(shares: readonly Float32Array[]): boolean[][] {
  return shares.map((share) => Array.from(share, (value) => value >= 0.5))
}

/** Returns the count of frames in which one or more singers sing. */
function countSungFrames(active: readonly boolean[][]): number {
  const frames = active[0]?.length ?? 0
  let sungFrames = 0
  for (let frame = 0; frame < frames; frame++) {
    if (active.some((singer) => singer[frame] === true)) sungFrames++
  }
  return sungFrames
}
