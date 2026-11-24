import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { AddWordAction } from './AddWordAction.tsx'
import { UnknownWordCounter } from './UnknownWordCounter.tsx'

const VOICE = 'song-1-voice'

function word(id: string, startMs: number, unknown: boolean, voiceId = VOICE): Mark {
  return {
    id,
    voiceId,
    layer: 'word',
    label: id,
    startMs,
    endMs: startMs + 500,
    parentId: null,
    edited: false,
    unknown,
  }
}

function openSongWith(marks: Mark[]) {
  useSongStore.setState({ current: { ...makeSongContent(), marks } })
}

const THREE_UNKNOWN = [
  word('Zxqv', 3000, true),
  word('silent', 500, false),
  word('Blorp', 1000, true),
  word('Gnarf', 2000, true),
  word('Other', 4000, true, 'voice-2'),
]

beforeEach(() => {
  useViewStore.getState().resetView()
})

afterEach(() => {
  useSongStore.getState().closeSong()
})

describe('UnknownWordCounter', () => {
  it('shows "3 unknown words" for a voice with 3 unknown words', () => {
    openSongWith(THREE_UNKNOWN)
    render(<UnknownWordCounter />)

    expect(screen.getByRole('button', { name: '3 unknown words' })).toBeInTheDocument()
  })

  it('shows "1 unknown word" for a voice with 1 unknown word', () => {
    openSongWith([word('Zxqv', 0, true), word('silent', 500, false)])
    render(<UnknownWordCounter />)

    expect(screen.getByRole('button', { name: '1 unknown word' })).toBeInTheDocument()
  })

  it('is absent for a voice with no unknown word', () => {
    openSongWith([word('silent', 500, false), word('Other', 4000, true, 'voice-2')])
    const { container } = render(<UnknownWordCounter />)

    expect(container).toBeEmptyDOMElement()
  })

  it('selects the first unknown word after the play position', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    useViewStore.getState().setPlayTime(1500)
    render(<UnknownWordCounter />)

    await user.click(screen.getByRole('button', { name: '3 unknown words' }))

    expect(useViewStore.getState().selectedMarkIds).toEqual(['Gnarf'])
  })

  it('selects the first unknown word of the voice when no unknown word is after the play position', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    useViewStore.getState().setPlayTime(3500)
    render(<UnknownWordCounter />)

    await user.click(screen.getByRole('button', { name: '3 unknown words' }))

    expect(useViewStore.getState().selectedMarkIds).toEqual(['Blorp'])
  })

  it('selects the next unknown word on each press and starts again after the last', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    render(<UnknownWordCounter />)
    const counter = screen.getByRole('button', { name: '3 unknown words' })

    const selected: string[][] = []
    for (let press = 0; press < 4; press++) {
      await user.click(counter)
      selected.push(useViewStore.getState().selectedMarkIds)
    }

    expect(selected).toEqual([['Blorp'], ['Gnarf'], ['Zxqv'], ['Blorp']])
  })

  it('scrolls to the word when the editor is zoomed in, and keeps the scroll at the default zoom', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    render(<UnknownWordCounter />)
    const counter = screen.getByRole('button', { name: '3 unknown words' })

    await user.click(counter)
    expect(useViewStore.getState().scrollMs).toBe(0)

    act(() => useViewStore.getState().setZoom(200))
    await user.click(counter)
    expect(useViewStore.getState().scrollMs).toBe(2000)
  })

  it('counts the unknown words of the selected voice', () => {
    const content = makeSongContent()
    const harmony = { id: 'voice-2', songId: 'song-1', name: 'Harmony', order: 1, color: '#5d9ee0' }
    useSongStore.setState({
      current: { ...content, voices: [...content.voices, harmony], marks: THREE_UNKNOWN },
    })
    useViewStore.getState().selectVoice('voice-2')
    render(<UnknownWordCounter />)

    expect(screen.getByRole('button', { name: '1 unknown word' })).toBeInTheDocument()
  })

  it('counts again after a change to the marks', () => {
    openSongWith(THREE_UNKNOWN)
    render(<UnknownWordCounter />)

    act(() => openSongWith([word('Zxqv', 3000, false), word('Blorp', 1000, true)]))

    expect(screen.getByRole('button', { name: '1 unknown word' })).toBeInTheDocument()
  })
})

describe('AddWordAction', () => {
  it('is absent with no selection, with a known word and with two selected unknown words', () => {
    openSongWith(THREE_UNKNOWN)
    render(<AddWordAction />)
    const action = () => screen.queryByRole('button', { name: 'Add to custom dictionary' })

    expect(action()).toBeNull()
    act(() => useViewStore.getState().selectMarks(['silent']))
    expect(action()).toBeNull()
    act(() => useViewStore.getState().selectMarks(['Blorp', 'Gnarf']))
    expect(action()).toBeNull()
  })

  it('opens the custom dictionary dialog with the selected unknown word in the form', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    useViewStore.getState().selectMarks(['Zxqv'])
    render(<AddWordAction />)

    await user.click(screen.getByRole('button', { name: 'Add to custom dictionary' }))

    const dialog = screen.getByRole('dialog', { name: 'Custom dictionary' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Word' })).toHaveValue('ZXQV')
    expect(screen.getByRole('textbox', { name: 'CMU symbols' })).toHaveFocus()
  })

  it('keeps the dialog open when the word becomes known', async () => {
    const user = userEvent.setup()
    openSongWith(THREE_UNKNOWN)
    useViewStore.getState().selectMarks(['Zxqv'])
    render(<AddWordAction />)
    await user.click(screen.getByRole('button', { name: 'Add to custom dictionary' }))

    act(() => openSongWith([word('Zxqv', 3000, false)]))

    expect(screen.queryByRole('button', { name: 'Add to custom dictionary' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Custom dictionary' })).toBeInTheDocument()
  })
})
