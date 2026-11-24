import { beforeEach, describe, expect, it } from 'vitest'
import { PHONEME_LABELS } from '../../lib/dictionary/cmuSymbols.ts'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { find, openTestSong, steps } from './actions.test-helpers.ts'
import { setPhonemeLabel } from './setPhonemeLabel.ts'

beforeEach(() => openTestSong())

describe('setPhonemeLabel', () => {
  it('offers exactly the ten phoneme labels', () => {
    expect(PHONEME_LABELS).toEqual(['AI', 'E', 'etc', 'FV', 'L', 'MBP', 'O', 'rest', 'U', 'WQ'])
  })

  it('sets the label and sets edited on the phoneme and its word, as one undo step', () => {
    setPhonemeLabel('w2b', 'O')

    expect(find('w2b')).toMatchObject({ label: 'O', edited: true })
    expect(find('w2')?.edited).toBe(true)
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('records no step for the same label or a mark that is no phoneme', () => {
    setPhonemeLabel('w2b', 'AI')
    setPhonemeLabel('w2', 'O')

    expect(steps()).toBe(0)
  })
})
