import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import type { Mark, SongContent } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Layers } from './Layers.tsx'

const WIDTH_PX = 1000

function mark(overrides: Partial<Mark> & Pick<Mark, 'id' | 'layer' | 'label'>): Mark {
  return {
    voiceId: 'song-1-voice',
    startMs: 0,
    endMs: 1000,
    parentId: null,
    edited: false,
    ...overrides,
  }
}

/** Returns a song of 20 000 ms, so 1 ms is 0.05 px at the default zoom in 1000 px. */
function songWith(marks: Mark[]): SongContent {
  const content = makeSongContent()
  return { ...content, song: { ...content.song, durationMs: 20_000 }, marks }
}

const MARKS = [
  mark({ id: 'p1', layer: 'phrase', label: 'Silent night, holy night', endMs: 8000 }),
  // The second word comes first, as in a song that the database returns in key order.
  mark({ id: 'w2', layer: 'word', label: 'night', startMs: 4000, endMs: 8000 }),
  mark({ id: 'w1', layer: 'word', label: 'Silent', startMs: 2000, endMs: 4000 }),
  mark({ id: 'f1', layer: 'phoneme', label: 'AI', startMs: 2000, endMs: 2400 }),
  mark({ id: 'f2', layer: 'phoneme', label: 'rest', startMs: 2400, endMs: 2600 }),
  mark({ id: 'x1', layer: 'word', label: 'Gloria', voiceId: 'voice-2', startMs: 9000 }),
]

function layer(name: string) {
  return within(screen.getByRole('list', { name }))
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(WIDTH_PX)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Layers', () => {
  it('shows the phrase layer, the word layer and the phoneme layer with their marks in time order', () => {
    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    expect(screen.getAllByRole('list')).toHaveLength(3)
    expect(
      layer('Phrases')
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Silent night, holy night'])
    expect(
      layer('Words')
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Silent', 'night'])
    expect(
      layer('Phonemes')
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['AI', 'rest'])
  })

  it('places each mark at its time on the time scale of the full song', () => {
    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    const night = layer('Words').getByText('night').closest('li')
    expect(night).toHaveStyle({ left: '200px', width: '200px' })
  })

  it('uses the zoom and the scroll offset of the view store', () => {
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 3000 })

    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    expect(layer('Words').getByText('night').closest('li')).toHaveStyle({
      left: '100px',
      width: '400px',
    })
  })

  it('draws only the marks in view', () => {
    // 100 px for each second in 1000 px shows 0 to 10 000 ms after a scroll to 5000 ms.
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 5000 })
    const many = Array.from({ length: 200 }, (_, index) =>
      mark({
        id: `w${index}`,
        layer: 'word',
        label: 'la',
        startMs: index * 100,
        endMs: index * 100 + 100,
      }),
    )

    render(<Layers content={songWith(many)} onTranscribe={() => undefined} />)

    expect(layer('Words').getAllByRole('listitem')).toHaveLength(100)
  })

  it('draws only the marks in view of 3 000 marks at 1000 pixels for each second', () => {
    // 1000 px at 1000 px for each second show 1000 ms: from 150 000 ms to 151 000 ms.
    useViewStore.setState({ pxPerSecond: 1000, scrollMs: 150_000 })
    const many = Array.from({ length: 3000 }, (_, index) =>
      mark({
        id: `w${index}`,
        layer: 'word',
        label: 'la',
        startMs: index * 100,
        endMs: index * 100 + 100,
      }),
    )
    const content = songWith(many)

    render(<Layers content={{ ...content, song: { ...content.song, durationMs: 300_000 } }} />)

    const items = layer('Words').getAllByRole('listitem')
    expect(items).toHaveLength(10)
    expect(items[0]).toHaveStyle({ left: '0px', width: '100px' })
  })

  it('shows the marks of the selected voice only', () => {
    const content = songWith(MARKS)
    const [voice] = content.voices
    if (!voice) throw new Error('The fixture has no voice.')
    content.voices.push({ ...voice, id: 'voice-2', order: 1 })
    useViewStore.getState().selectVoice('voice-2')

    render(<Layers content={content} onTranscribe={() => undefined} />)

    expect(
      layer('Words')
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Gloria'])
  })

  it('gives each phoneme its label as text and as the key of its colour', () => {
    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    const items = layer('Phonemes').getAllByRole('listitem')
    expect(items.map((item) => [item.dataset.label, item.textContent])).toEqual([
      ['AI', 'AI'],
      ['rest', 'rest'],
    ])
    expect(items[0]).toHaveClass('mark', 'mark-phoneme')
    expect(layer('Words').getByText('Silent').closest('li')).not.toHaveAttribute('data-label')
  })

  it('gives each mark a tooltip with the full label, the start and the end, and a label element that CSS cuts', () => {
    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    const phrase = layer('Phrases').getByRole('listitem')
    expect(phrase).toHaveAttribute('title', 'Silent night, holy night\n0:00.000 to 0:08.000')
    expect(phrase).toHaveClass('mark-phrase')
    expect(within(phrase).getByText('Silent night, holy night')).toHaveClass('mark-label')
  })

  it('follows a change of the zoom', () => {
    render(<Layers content={songWith(MARKS)} onTranscribe={() => undefined} />)

    act(() => useViewStore.getState().setZoom(100))

    expect(layer('Words').getByText('night').closest('li')).toHaveStyle({ left: '400px' })
  })

  it('shows the empty state with a Transcribe button for a voice with no marks', async () => {
    const onTranscribe = vi.fn()
    render(<Layers content={songWith([])} onTranscribe={onTranscribe} />)

    expect(
      screen.getByText('No marks yet. Select Transcribe to find the words.'),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('list')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Transcribe' }))

    expect(onTranscribe).toHaveBeenCalledOnce()
  })

  it('shows the empty state with no Transcribe button when it gets no handler', () => {
    render(<Layers content={songWith([])} />)

    expect(
      screen.getByText('No marks yet. Select Transcribe to find the words.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Transcribe' })).toBeNull()
  })

  it('shows the empty state for a voice with no marks when another voice has marks', () => {
    const content = songWith(MARKS.filter((item) => item.voiceId === 'voice-2'))

    render(<Layers content={content} onTranscribe={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
  })
})
