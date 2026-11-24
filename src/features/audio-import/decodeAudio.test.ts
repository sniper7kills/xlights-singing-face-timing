import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeWithWebAudio } from './createSongFromFile.ts'
import { decodeAudio } from './decodeAudio.ts'

const created: unknown[][] = []
const live = vi.fn()

function stubOfflineContext(decoded: Promise<unknown>) {
  created.length = 0
  vi.stubGlobal('AudioContext', live)
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      constructor(...args: unknown[]) {
        created.push(args)
      }
      decodeAudioData = () => decoded
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  live.mockClear()
})

describe('decodeAudio', () => {
  it('decodes in a one-channel offline context at the asked sample rate', async () => {
    const buffer = { duration: 2 }
    stubOfflineContext(Promise.resolve(buffer))

    await expect(decodeAudio(new ArrayBuffer(1), 8000)).resolves.toBe(buffer)

    expect(created).toEqual([[1, 1, 8000]])
    expect(live).not.toHaveBeenCalled()
  })

  it('rejects when the browser cannot decode the bytes', async () => {
    stubOfflineContext(Promise.reject(new Error('EncodingError')))

    await expect(decodeAudio(new ArrayBuffer(1), 8000)).rejects.toThrow('EncodingError')
  })
})

describe('decodeWithWebAudio', () => {
  it('returns the duration from an offline context and makes no live audio context', async () => {
    stubOfflineContext(Promise.resolve({ duration: 173.4 }))

    await expect(decodeWithWebAudio(new ArrayBuffer(1))).resolves.toBe(173.4)

    expect(created).toHaveLength(1)
    expect(live).not.toHaveBeenCalled()
  })
})
