import { act, render, screen, within } from '@testing-library/react'
import { Profiler } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import type { Mark, SongContent, Voice } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { GhostRow } from './GhostRow.tsx'

const LEAD = 'song-1-voice'

function voice(id: string, name: string, order: number, color: string): Voice {
  return { id, songId: 'song-1', name, order, color }
}

const VOICES = [
  voice(LEAD, 'Lead Vocals', 0, '#ffb238'),
  voice('v2', 'Santa', 1, '#4cc9f0'),
  voice('v3', 'Choir', 2, '#7ae582'),
]

function phrase(id: string, voiceId: string, startMs: number, endMs: number): Mark {
  return {
    id,
    voiceId,
    layer: 'phrase',
    label: `${id} text`,
    startMs,
    endMs,
    parentId: null,
    edited: false,
  }
}

const MARKS: Mark[] = [
  phrase('lead1', LEAD, 0, 2000),
  phrase('santa1', 'v2', 1000, 3000),
  { ...phrase('santa-word', 'v2', 1000, 2000), layer: 'word', parentId: 'santa1' },
  phrase('choir1', 'v3', 4000, 6000),
  phrase('santa2', 'v2', 15_000, 18_000),
]

/** Returns a song of 20 000 ms, so 1 ms is 0.05 px at the default zoom in 1000 px. */
function songWith(voices: Voice[], marks: Mark[] = MARKS): SongContent {
  const content = makeSongContent()
  return { ...content, song: { ...content.song, durationMs: 20_000 }, voices, marks }
}

function bars() {
  return within(screen.getByRole('list', { name: 'Other voices' })).queryAllByRole('listitem')
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
})

describe('GhostRow', () => {
  it('shows a bar for each phrase of each other voice, with the colour and the name of the voice', () => {
    render(<GhostRow content={songWith(VOICES)} />)

    expect(bars().map((bar) => bar.textContent)).toEqual([
      'Santa: santa1 text',
      'Choir: choir1 text',
      'Santa: santa2 text',
    ])
    const [santa, choir] = bars()
    expect(santa).toHaveAttribute('data-voice-id', 'v2')
    expect(santa).toHaveStyle({ background: '#4cc9f0', left: '50px', width: '100px', top: '0px' })
    expect(choir).toHaveStyle({ background: '#7ae582', top: '10px' })
  })

  it('shows the bars of the first voice when the layers show another voice', () => {
    render(<GhostRow content={songWith(VOICES)} />)
    act(() => useViewStore.getState().selectVoice('v2'))

    expect(bars().map((bar) => bar.dataset.voiceId)).toEqual([LEAD, 'v3'])
  })

  it('shows a changed colour of a voice on its bars', () => {
    const { rerender } = render(<GhostRow content={songWith(VOICES)} />)
    const sky = VOICES.map((item) => (item.id === 'v2' ? { ...item, color: '#ff6b9a' } : item))

    rerender(<GhostRow content={songWith(sky)} />)

    expect(bars()[0]).toHaveStyle({ background: '#ff6b9a' })
  })

  it('draws only the bars in view', () => {
    useViewStore.getState().setZoom(100)
    render(<GhostRow content={songWith(VOICES)} />)

    expect(bars().map((bar) => bar.dataset.voiceId)).toEqual(['v2', 'v3'])
    act(() => useViewStore.getState().setScroll(14_000))
    expect(bars().map((bar) => bar.textContent)).toEqual(['Santa: santa2 text'])
  })

  it('does not draw again when the play time changes', () => {
    const onRender = vi.fn()
    render(
      <Profiler id="ghost" onRender={onRender}>
        <GhostRow content={songWith(VOICES)} />
      </Profiler>,
    )
    const renders = onRender.mock.calls.length

    act(() => useViewStore.getState().setPlayTime(5000))

    expect(onRender).toHaveBeenCalledTimes(renders)
  })

  it('shows an empty row when no other voice has a phrase', () => {
    render(<GhostRow content={songWith(VOICES, MARKS.slice(0, 1))} />)

    expect(bars()).toHaveLength(0)
  })

  it('renders nothing for a song with one voice', () => {
    const { container } = render(<GhostRow content={songWith(VOICES.slice(0, 1))} />)

    expect(container).toBeEmptyDOMElement()
  })
})
