import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { breakDownWords } from '../../store/actions/breakDown.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { BreakDownAgainAction } from './BreakDownAgainAction.tsx'
import { DictionaryLoadError } from './loadDictionary.ts'

vi.mock('../../store/actions/breakDown.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/actions/breakDown.ts')>()),
  breakDownWords: vi.fn(),
}))

function word(id: string, edited: boolean): Mark {
  return {
    id,
    voiceId: 'song-1-voice',
    layer: 'word',
    label: id,
    startMs: 0,
    endMs: 500,
    parentId: null,
    edited,
  }
}

const PHRASE: Mark = { ...word('p1', false), layer: 'phrase' }

beforeEach(() => {
  useViewStore.getState().resetView()
  useSongStore.setState({
    current: { ...makeSongContent(), marks: [PHRASE, word('a', false), word('b', true)] },
  })
  vi.mocked(breakDownWords).mockResolvedValue()
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('BreakDownAgainAction', () => {
  it('shows no button when no word is selected', () => {
    useViewStore.getState().selectMarks(['p1'])
    render(<BreakDownAgainAction onFailure={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Break down again' })).toBeNull()
  })

  it('breaks down the selected words again', async () => {
    const user = userEvent.setup()
    useViewStore.getState().selectMarks(['p1', 'a', 'b'])
    render(<BreakDownAgainAction onFailure={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Break down again' })
    expect(button).toHaveAttribute('title', 'An edited word keeps its phonemes.')
    await user.click(button)

    expect(breakDownWords).toHaveBeenCalledWith(['a', 'b'])
  })

  it('disables the button when every selected word is edited', () => {
    useViewStore.getState().selectMarks(['b'])
    render(<BreakDownAgainAction onFailure={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Break down again' })).toBeDisabled()
  })

  it('reports a dictionary that does not load with the copy of the feature file', async () => {
    const user = userEvent.setup()
    const onFailure = vi.fn()
    vi.mocked(breakDownWords).mockRejectedValue(new DictionaryLoadError())
    useViewStore.getState().selectMarks(['a'])
    render(<BreakDownAgainAction onFailure={onFailure} />)

    await user.click(screen.getByRole('button', { name: 'Break down again' }))

    await waitFor(() =>
      expect(onFailure).toHaveBeenCalledWith({
        message: 'The dictionary did not load. Check the connection and retry.',
        wordIds: ['a'],
      }),
    )
  })
})
