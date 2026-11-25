import { describe, expect, it, vi } from 'vitest'
import { createSeparator } from './index.ts'

const engines = vi.hoisted(() => ({
  spleeter: { separate: async () => new Float32Array([1]) },
  demucs: { separate: async () => new Float32Array([2]) },
}))

vi.mock('./spleeterSeparator.ts', () => ({ createSpleeterSeparator: () => engines.spleeter }))
vi.mock('./demucsSeparator.ts', () => ({ createDemucsSeparator: () => engines.demucs }))

const audio = { left: new Float32Array(1), right: new Float32Array(1), sampleRate: 44100 as const }
const events = { download: vi.fn(), progress: vi.fn() }

describe('createSeparator', () => {
  it('returns the Spleeter engine for spleeter', () => {
    expect(createSeparator('spleeter')).toBe(engines.spleeter)
  })

  it('runs the Demucs engine for demucs', async () => {
    const vocals = await createSeparator('demucs').separate(audio, events)

    expect(Array.from(vocals)).toEqual([2])
  })
})
