import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRunData, onRunDataSaved, saveRunData, StorageFullError } from '../../store/db.ts'
import type { RunData } from '../../store/types.ts'
import type { SeparatedAudio } from '../vocal-separation/protocol.ts'
import { resampleSeparated } from '../vocal-separation/separationAudio.ts'
import {
  keepRunData,
  RUN_DATA_WRITE_LIMIT_MS,
  STORAGE_FULL_NOTE,
  startRunRecord,
  tracksToKeep,
} from './runRecord.ts'

vi.mock('../../store/db.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/db.ts')>()),
  saveRunData: vi.fn(),
}))
vi.mock('../vocal-separation/separationAudio.ts', () => ({ resampleSeparated: vi.fn() }))

const TRACK = { startMs: 0, sampleRate: 22_050, samples: new Int16Array(4) }

function runData(withTracks: boolean): RunData {
  return {
    songId: 'song-1',
    ...(withTracks ? { tracks: { vocals: TRACK, instruments: TRACK } } : {}),
    singerSegments: [],
    // The write reads only the notes and the track flag of the report.
    report: { notes: [], tracksKept: withTracks } as unknown as RunData['report'],
  }
}

const { saveRunData: realSave } =
  await vi.importActual<typeof import('../../store/db.ts')>('../../store/db.ts')

/**
 * Makes the next write wait until the test calls the returned function, and then run `write`.
 * The test controls the time of the end of the write.
 */
function holdWrite(write: (data: RunData) => Promise<void>): () => void {
  let release = () => undefined as void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.mocked(saveRunData).mockImplementationOnce(async (data) => {
    await gate
    return write(data)
  })
  return release
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('keepRunData', () => {
  it('returns stored after a complete write', async () => {
    vi.mocked(saveRunData).mockResolvedValue(undefined)

    expect(await keepRunData(runData(true))).toBe('stored')
  })

  it('writes again with no tracks and a report line when the storage is full', async () => {
    vi.mocked(saveRunData)
      .mockRejectedValueOnce(new StorageFullError())
      .mockResolvedValueOnce(undefined)

    expect(await keepRunData(runData(true))).toBe('storage-full')

    const second = vi.mocked(saveRunData).mock.calls[1]?.[0]
    expect(second).not.toHaveProperty('tracks')
    expect(second?.report.tracksKept).toBe(false)
    expect(second?.report.notes).toEqual([STORAGE_FULL_NOTE])
  })

  it('returns failed when the second write fails too', async () => {
    vi.mocked(saveRunData).mockRejectedValue(new StorageFullError())

    expect(await keepRunData(runData(true))).toBe('failed')
  })

  it('returns failed and writes one time for a full storage with no tracks', async () => {
    vi.mocked(saveRunData).mockRejectedValue(new StorageFullError())

    expect(await keepRunData(runData(false))).toBe('failed')
    expect(saveRunData).toHaveBeenCalledTimes(1)
  })

  it('returns failed for a write failure that is not a full storage', async () => {
    vi.mocked(saveRunData).mockRejectedValue(new Error('The transaction stopped.'))

    expect(await keepRunData(runData(true))).toBe('failed')
    expect(saveRunData).toHaveBeenCalledTimes(1)
  })

  it('returns failed at once for a fast write failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(saveRunData).mockRejectedValue(new Error('The transaction stopped.'))

    const result = keepRunData(runData(true))
    await vi.advanceTimersByTimeAsync(0)

    expect(await Promise.race([result, Promise.resolve('waiting')])).toBe('failed')
  })

  it('returns late after 5 seconds, and the late write stores the run data and tells the editor', async () => {
    const release = holdWrite(async (data) => realSave(data))
    const saved: string[] = []
    const stop = onRunDataSaved((songId) => saved.push(songId))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const result = keepRunData(runData(true))

    await vi.advanceTimersByTimeAsync(RUN_DATA_WRITE_LIMIT_MS - 1)
    const early = await Promise.race([result, Promise.resolve('waiting')])
    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()

    expect(RUN_DATA_WRITE_LIMIT_MS).toBe(5000)
    expect(early).toBe('waiting')
    expect(await result).toBe('late')
    expect(saved).toEqual([])
    release()
    await vi.waitFor(() => expect(saved).toEqual(['song-1']))
    stop()
    const stored = await loadRunData('song-1')
    expect(stored?.tracks?.vocals.samples.length).toBe(4)
  })

  it('returns late, and a late full storage stores the report with no tracks and its note', async () => {
    const release = holdWrite(async () => {
      throw new StorageFullError()
    })
    vi.mocked(saveRunData).mockImplementation(async (data) => realSave(data))
    const saved: string[] = []
    const stop = onRunDataSaved((songId) => saved.push(songId))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const result = keepRunData(runData(true))
    await vi.advanceTimersByTimeAsync(RUN_DATA_WRITE_LIMIT_MS)
    vi.useRealTimers()

    expect(await result).toBe('late')
    release()
    await vi.waitFor(() => expect(saved).toEqual(['song-1']))
    stop()
    const stored = await loadRunData('song-1')
    expect(stored?.tracks).toBeUndefined()
    expect(stored?.report.notes).toEqual([STORAGE_FULL_NOTE])
  })
})

describe('tracksToKeep', () => {
  it('returns null for a separation with no instruments', async () => {
    const separated: SeparatedAudio = { vocals: new Float32Array(4) }

    expect(await tracksToKeep(separated, 0)).toBeNull()
    expect(resampleSeparated).not.toHaveBeenCalled()
  })

  it('gives each track the start of the range', async () => {
    vi.mocked(resampleSeparated).mockResolvedValue(new Float32Array([0.5, -1]))
    const separated = { vocals: new Float32Array(4), instruments: new Float32Array(4) }

    const tracks = await tracksToKeep(separated, 5000)

    expect(tracks?.vocals).toEqual({
      startMs: 5000,
      sampleRate: 22_050,
      samples: new Int16Array([16384, -32767]),
    })
    expect(tracks?.instruments.startMs).toBe(5000)
  })
})

describe('startRunRecord', () => {
  it('starts with no audio track', () => {
    expect(startRunRecord()).toMatchObject({ trackCount: 0, tracks: null })
  })
})
