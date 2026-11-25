import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StereoAudio } from '../protocol.ts'
import { createFixtureSeparator } from './fixtureSeparator.ts'

const audio: StereoAudio = {
  left: new Float32Array([1, 0, 0.5]),
  right: new Float32Array([0, 1, 0.5]),
  sampleRate: 44100,
}

async function run(instruments: boolean) {
  vi.useFakeTimers()
  const result = createFixtureSeparator().separate(
    audio,
    { download: vi.fn(), progress: vi.fn() },
    instruments,
  )
  await vi.runAllTimersAsync()
  return result
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createFixtureSeparator', () => {
  it('returns the mono mix as the vocals and the inverted half mix as the instruments', async () => {
    const result = await run(true)

    expect(result.vocals).toEqual(new Float32Array([0.5, 0.5, 0.5]))
    expect(result.instruments).toEqual(new Float32Array([-0.25, -0.25, -0.25]))
  })

  it('returns no instruments field without the instruments flag', async () => {
    expect(await run(false)).not.toHaveProperty('instruments')
  })
})
