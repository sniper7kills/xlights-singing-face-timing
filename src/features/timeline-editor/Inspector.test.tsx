import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { PHONEME_LABELS } from '../../lib/dictionary/cmuSymbols.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, Voice } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Inspector } from './Inspector.tsx'
import { resetMarkUi, useMarkUiStore } from './markUiStore.ts'
import { MOUTH_SHAPES } from './mouthShapes.ts'

const VOICE = 'song-1-voice'

function mark(id: string, fields: Partial<Mark> & Pick<Mark, 'layer' | 'startMs' | 'endMs'>): Mark {
  return { id, voiceId: VOICE, label: id, parentId: null, edited: false, ...fields }
}

// The frame size is 50 ms. The gap between the two phrases is from 14 000 ms to 16 000 ms.
const MARKS: Mark[] = [
  mark('p1', { layer: 'phrase', label: 'silent night', startMs: 10_000, endMs: 14_000 }),
  mark('w1', { layer: 'word', label: 'silent', startMs: 10_000, endMs: 12_000, parentId: 'p1' }),
  mark('w2', { layer: 'word', label: 'night', startMs: 12_000, endMs: 14_000, parentId: 'p1' }),
  mark('f1', { layer: 'phoneme', label: 'etc', startMs: 10_000, endMs: 11_000, parentId: 'w1' }),
  mark('f2', { layer: 'phoneme', label: 'O', startMs: 11_000, endMs: 12_000, parentId: 'w1' }),
  mark('f3', { layer: 'phoneme', label: 'AI', startMs: 12_000, endMs: 14_000, parentId: 'w2' }),
  mark('p2', { layer: 'phrase', label: 'holy', startMs: 16_000, endMs: 18_000 }),
  mark('w3', { layer: 'word', label: 'holy', startMs: 16_000, endMs: 18_000, parentId: 'p2' }),
  mark('f4', { layer: 'phoneme', label: 'L', startMs: 16_000, endMs: 18_000, parentId: 'w3' }),
]

function stored(id: string): Mark | undefined {
  return useSongStore.getState().current?.marks.find((item) => item.id === id)
}

function select(id: string) {
  act(() => useViewStore.getState().selectMarks([id]))
}

function setPlayTime(ms: number) {
  act(() => useViewStore.getState().setPlayTime(ms))
}

function steps(): number {
  return useSongStore.getState().history.past.length
}

beforeEach(() => {
  const content = makeSongContent()
  useSongStore.setState({
    current: { ...content, song: { ...content.song, durationMs: 20_000 }, marks: MARKS },
    history: emptyHistory(),
  })
  useViewStore.getState().resetView()
  resetMarkUi()
})

describe('Inspector fields', () => {
  it('asks for one selected mark when no mark or two marks are selected', () => {
    render(<Inspector />)
    expect(screen.getByText('Select one mark to see its fields.')).toBeInTheDocument()
    act(() => useViewStore.getState().selectMarks(['w1', 'w2']))
    expect(screen.getByText('Select one mark to see its fields.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('shows the label, the start, the end and the length of the selected mark', async () => {
    render(<Inspector />)
    select('w1')
    const fields = await screen.findByRole('region', { name: 'Selected word' })
    expect(within(fields).getByRole('textbox', { name: 'Label' })).toHaveValue('silent')
    expect(within(fields).getByRole('textbox', { name: 'Start' })).toHaveValue('0:10.000')
    expect(within(fields).getByRole('textbox', { name: 'End' })).toHaveValue('0:12.000')
    expect(within(fields).getByText('2000 ms · 40 frames')).toBeInTheDocument()
  })

  it('sets the start to 12 350 ms for a typed 0:12.350, as one undo step', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const start = await screen.findByRole('textbox', { name: 'Start' })
    await user.clear(start)
    await user.type(start, '0:12.350{Enter}')
    expect(stored('w2')?.startMs).toBe(12_350)
    expect(steps()).toBe(1)
    await waitFor(() => expect(start).toHaveValue('0:12.350'))
  })

  it('shows the legal time that the resize rules give for a typed end time', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const end = await screen.findByRole('textbox', { name: 'End' })
    await user.clear(end)
    await user.type(end, '0:13.360{Enter}')
    expect(stored('w2')?.endMs).toBe(13_350)
    await waitFor(() => expect(end).toHaveValue('0:13.350'))
  })

  it('saves a typed time when the field loses the focus', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const end = await screen.findByRole('textbox', { name: 'End' })
    await user.clear(end)
    await user.type(end, '0:13.500')
    await user.tab()
    expect(stored('w2')?.endMs).toBe(13_500)
  })

  it('shows "Use m:ss.mmm" for a typed time that is not a time and changes nothing', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const start = await screen.findByRole('textbox', { name: 'Start' })
    await user.clear(start)
    await user.type(start, 'soon{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Use m:ss.mmm')
    expect(start).toHaveAttribute('aria-invalid', 'true')
    expect(stored('w2')?.startMs).toBe(12_000)
    expect(steps()).toBe(0)
  })

  it('gives back the stored time and clears the error on Escape', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const start = await screen.findByRole('textbox', { name: 'Start' })
    await user.clear(start)
    await user.type(start, 'soon{Enter}')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(start).toHaveValue('0:12.000'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('records no step for a typed time that equals the stored time', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w2')
    const start = await screen.findByRole('textbox', { name: 'Start' })
    await user.clear(start)
    await user.type(start, '0:12.000{Enter}')
    expect(steps()).toBe(0)
  })

  it('sets a typed word label', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('w3')
    const label = await screen.findByRole('textbox', { name: 'Label' })
    await user.clear(label)
    await user.type(label, 'holly{Enter}')
    expect(stored('w3')?.label).toBe('holly')
  })

  it('waits for the confirm dialog for a phrase label that changes the words', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('p1')
    const label = await screen.findByRole('textbox', { name: 'Label' })
    await user.clear(label)
    await user.type(label, 'silent day{Enter}')
    expect(useMarkUiStore.getState().pending).toEqual({ id: 'p1', label: 'silent day' })
    expect(stored('p1')?.label).toBe('silent night')
  })

  it('shows the ten phoneme labels for a phoneme and sets the chosen label', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    select('f2')
    const label = await screen.findByRole('combobox', { name: 'Label' })
    expect(
      within(label)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([...PHONEME_LABELS])
    await user.selectOptions(label, 'MBP')
    expect(stored('f2')?.label).toBe('MBP')
    expect(stored('f2')?.edited).toBe(true)
  })

  it('shows the fields of a mark that a key or a click selects later', async () => {
    render(<Inspector />)
    select('w1')
    select('w3')
    expect(await screen.findByRole('textbox', { name: 'Label' })).toHaveValue('holy')
  })
})

describe('FacePreview', () => {
  function mouth() {
    return screen.getByTestId('mouth')
  }

  it('shows the O mouth at a time inside an O phoneme', () => {
    render(<Inspector />)
    setPlayTime(11_500)
    expect(mouth()).toHaveAttribute('d', MOUTH_SHAPES.O)
    expect(screen.getByTestId('face-phoneme')).toHaveTextContent('O')
    expect(screen.getByRole('img', { name: 'Face preview, mouth shape O' })).toBeInTheDocument()
  })

  it('shows the closed mouth and blinks the eyes at a time between two words', () => {
    const { container } = render(<Inspector />)
    setPlayTime(15_000)
    expect(mouth()).toHaveAttribute('d', MOUTH_SHAPES.rest)
    expect(screen.getByTestId('face-phoneme')).toHaveTextContent('rest')
    expect(container.querySelector('.face-eyes')).toHaveClass('blink')
  })

  it('keeps the eyes open during a phoneme that is not rest', () => {
    const { container } = render(<Inspector />)
    setPlayTime(16_500)
    expect(mouth()).toHaveAttribute('d', MOUTH_SHAPES.L)
    expect(container.querySelector('.face-eyes')).not.toHaveClass('blink')
  })

  it('changes the mouth when the play time moves to the next phoneme', () => {
    render(<Inspector />)
    setPlayTime(10_500)
    expect(mouth()).toHaveAttribute('d', MOUTH_SHAPES.etc)
    setPlayTime(12_500)
    expect(mouth()).toHaveAttribute('d', MOUTH_SHAPES.AI)
  })

  it('shows the name of the voice and has a distinct mouth for each phoneme label', () => {
    render(<Inspector />)
    expect(screen.getByText('Lead Vocals')).toBeInTheDocument()
    expect(new Set(PHONEME_LABELS.map((label) => MOUTH_SHAPES[label])).size).toBe(10)
  })

  it('uses no live region, so a screen reader does not read each change during play', () => {
    const { container } = render(<Inspector />)
    expect(container.querySelector('[aria-live], [role="status"], output')).toBeNull()
  })
})

describe('Face preview with several voices', () => {
  function withVoices(count: number, muted: number[] = []) {
    const content = useSongStore.getState().current ?? makeSongContent()
    const names = ['Lead Vocals', 'Santa', 'Choir', 'Elf', 'Bass', 'Alto']
    const voices: Voice[] = names.slice(0, count).map((name, order) => ({
      id: order === 0 ? VOICE : `voice-${order}`,
      songId: content.song.id,
      name,
      order,
      color: '#ffb238',
      ...(muted.includes(order) ? { previewMuted: true } : {}),
    }))
    act(() => useSongStore.setState({ current: { ...content, voices } }))
  }

  function captions() {
    return Array.from(document.querySelectorAll('.face-caption span')).map(
      (span) => span.textContent,
    )
  }

  it('shows two faces, each with its voice name, for a song with two unmuted voices', () => {
    withVoices(2)
    render(<Inspector />)

    expect(screen.getAllByRole('img', { name: /^Face preview, mouth shape/ })).toHaveLength(2)
    expect(captions()).toEqual(['Lead Vocals', 'Santa'])
  })

  it('shows no face for a muted voice', () => {
    withVoices(2, [0])
    render(<Inspector />)

    expect(captions()).toEqual(['Santa'])
    expect(document.querySelector(`[data-voice-id="${VOICE}"]`)).toBeNull()
  })

  it('shows the first 4 faces in voice order and "+2 more" for 6 unmuted voices', () => {
    withVoices(6)
    render(<Inspector />)

    expect(captions()).toEqual(['Lead Vocals', 'Santa', 'Choir', 'Elf'])
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows the mouth of each voice from its own phonemes', () => {
    withVoices(2)
    render(<Inspector />)
    setPlayTime(11_500)

    const shapes = screen.getAllByTestId('face-phoneme').map((label) => label.textContent)
    expect(shapes).toEqual(['O', 'rest'])
  })

  it('states how to show a face when every voice is muted', () => {
    withVoices(2, [0, 1])
    render(<Inspector />)

    expect(
      screen.getByText('Every voice is muted. Select the mute button of a voice to show its face.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows one face with no name for a song with no voice', () => {
    withVoices(0)
    render(<Inspector />)

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(captions()).toEqual([''])
  })
})
