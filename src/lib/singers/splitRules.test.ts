import { describe, expect, it } from 'vitest'
import {
  hasRoomForSplit,
  isSplitMode,
  keepPart,
  mixToMono,
  orderedTracks,
  SPLIT_LABELS,
  SPLIT_VOICE_NAME,
} from './splitRules.ts'

describe('split rules', () => {
  it('gives the voices "Female" and "Male" for the mode "Male and female"', () => {
    expect(SPLIT_LABELS['male-female'].map((label) => SPLIT_VOICE_NAME[label])).toEqual([
      'Female',
      'Male',
    ])
  })

  it('gives the voices "Lead" and "Backing" for the mode "Lead and backing"', () => {
    expect(SPLIT_LABELS['lead-backing'].map((label) => SPLIT_VOICE_NAME[label])).toEqual([
      'Lead',
      'Backing',
    ])
  })

  it('accepts the two modes only', () => {
    expect(isSplitMode('male-female')).toBe(true)
    expect(isSplitMode('lead-backing')).toBe(true)
    expect(isSplitMode('choir')).toBe(false)
    expect(isSplitMode(undefined)).toBe(false)
  })

  it('puts the tracks in the label order of the mode', () => {
    const male = { label: 'male' as const }
    const female = { label: 'female' as const }

    expect(orderedTracks('male-female', [male, female])).toEqual([female, male])
  })

  it('refuses tracks whose labels do not match the mode', () => {
    expect(orderedTracks('lead-backing', [{ label: 'male' }, { label: 'female' }])).toBeNull()
    expect(orderedTracks('male-female', [{ label: 'female' }])).toBeNull()
    expect(
      orderedTracks('male-female', [{ label: 'female' }, { label: 'male' }, { label: 'male' }]),
    ).toBeNull()
  })

  it('finds room for two voices up to 10 voices, and counts the voices that the run removes', () => {
    expect(hasRoomForSplit(10, 0)).toBe(true)
    expect(hasRoomForSplit(11, 0)).toBe(false)
    expect(hasRoomForSplit(12, 2)).toBe(true)
  })

  it('mixes two channels to one', () => {
    const mono = mixToMono({ left: new Float32Array([1, 0]), right: new Float32Array([0, 0.5]) })

    expect(mono).toEqual(new Float32Array([0.5, 0.25]))
  })

  it('keeps one part of the samples and sets the rest to 0', () => {
    const samples = new Float32Array([1, 2, 3, 4, 5])

    expect(keepPart(samples, 0.4, 0.8)).toEqual(new Float32Array([0, 0, 3, 4, 0]))
  })
})
