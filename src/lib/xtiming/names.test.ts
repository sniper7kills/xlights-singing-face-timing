import { describe, expect, it } from 'vitest'
import { defaultTrackName, songFileName, trackFileName, trackKey, UNSECTIONED } from './names.ts'

describe('trackKey', () => {
  it('returns the voice id for grouping by voice', () => {
    expect(trackKey('v1', null)).toBe('v1')
  })

  it('joins the voice id and the section id with a colon', () => {
    expect(trackKey('v1', 's1')).toBe('v1:s1')
  })
})

describe('defaultTrackName', () => {
  it('returns the voice name for grouping by voice', () => {
    expect(defaultTrackName('Lead Vocals', null)).toBe('Lead Vocals')
  })

  it('joins the voice name and the section name with a dash', () => {
    expect(defaultTrackName('Lead Vocals', 'Chorus 1')).toBe('Lead Vocals - Chorus 1')
  })

  it('names the track for the phrases outside every section Unsectioned', () => {
    expect(defaultTrackName('Lead Vocals', UNSECTIONED)).toBe('Lead Vocals - Unsectioned')
  })
})

describe('songFileName', () => {
  it('adds the xtiming extension to the song name', () => {
    expect(songFileName('Carol')).toBe('Carol.xtiming')
  })

  it('replaces each unsafe file character with an underscore', () => {
    expect(songFileName('a\\b/c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j.xtiming')
  })
})

describe('trackFileName', () => {
  it('joins the song name and the timing track name with a dash', () => {
    expect(trackFileName('Carol', 'Lead Vocals')).toBe('Carol - Lead Vocals.xtiming')
  })

  it('replaces the unsafe file characters in the song name and the timing track name', () => {
    expect(trackFileName('AC/DC', 'Lead: "Bon"?')).toBe('AC_DC - Lead_ _Bon__.xtiming')
  })
})
