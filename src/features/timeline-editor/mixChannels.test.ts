import { describe, expect, it } from 'vitest'
import { mixChannels } from './mixChannels.ts'

describe('mixChannels', () => {
  it('averages the left and the right channel of stereo audio', () => {
    const left = new Float32Array([1, 0.5, -1])
    const right = new Float32Array([0, 0.5, 1])

    expect([...mixChannels([left, right])]).toEqual([0.5, 0.5, 0])
  })

  it('returns the one channel of mono audio without a copy', () => {
    const mono = new Float32Array([0.25, -0.25])

    expect(mixChannels([mono])).toBe(mono)
  })

  it('returns no samples for audio with no channel', () => {
    expect(mixChannels([])).toHaveLength(0)
  })
})
