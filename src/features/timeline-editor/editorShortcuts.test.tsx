import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { type PointerEvent, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { keepSelectionInSong } from '../../store/selectionSync.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { SHORTCUT_KEYS, SHORTCUTS } from './editorShortcuts.ts'
import { Layers } from './Layers.tsx'
import { resetMarkUi, useMarkUiStore } from './markUiStore.ts'
import { attachPlayer, detachPlayer } from './playerStore.ts'
import { ShortcutList } from './ShortcutList.tsx'
import { UndoRedoButtons } from './UndoRedoButtons.tsx'
import { useMarkDrag } from './useMarkDrag.ts'
import type { WaveformPlayer } from './waveformPlayer.ts'

// A song of 20 000 ms in a stage of 1000 px. The frame size is 50 ms.
const VOICE = 'song-1-voice'

function mark(id: string, fields: Partial<Mark> & Pick<Mark, 'layer' | 'startMs' | 'endMs'>): Mark {
  return { id, voiceId: VOICE, label: id, parentId: null, edited: true, ...fields }
}

const MARKS: Mark[] = [
  mark('p1', { layer: 'phrase', label: 'silent night', startMs: 0, endMs: 8000 }),
  mark('w1', { layer: 'word', label: 'silent', startMs: 2000, endMs: 4000, parentId: 'p1' }),
  mark('w2', { layer: 'word', label: 'night', startMs: 4000, endMs: 7000, parentId: 'p1' }),
  mark('f1', { layer: 'phoneme', label: 'etc', startMs: 2000, endMs: 3000, parentId: 'w1' }),
  mark('f2', { layer: 'phoneme', label: 'AI', startMs: 3000, endMs: 4000, parentId: 'w1' }),
  mark('f3', { layer: 'phoneme', label: 'etc', startMs: 4000, endMs: 7000, parentId: 'w2' }),
  mark('p2', { layer: 'phrase', label: 'holy night', startMs: 10_000, endMs: 14_000 }),
  mark('w3', { layer: 'word', label: 'holy', startMs: 10_000, endMs: 12_000, parentId: 'p2' }),
  mark('f4', { layer: 'phoneme', label: 'O', startMs: 10_000, endMs: 12_000, parentId: 'w3' }),
]

function openSong() {
  const content = makeSongContent()
  useSongStore.setState({
    current: { ...content, song: { ...content.song, durationMs: 20_000 }, marks: MARKS },
    history: emptyHistory(),
  })
}

/** Holds the open state of the shortcut list, the same as the editor page. */
function Shortcuts() {
  const [open, setOpen] = useState(false)
  return <ShortcutList open={open} onOpenChange={setOpen} />
}

/** Draws the parts of the editor that the shortcuts use, again after each change, the same as the editor page. */
function Editor() {
  const content = useSongStore((state) => state.current)
  return (
    content && (
      <>
        <Layers content={content} />
        <UndoRedoButtons />
        <Shortcuts />
      </>
    )
  )
}

const marks = () => useSongStore.getState().current?.marks ?? []
const stored = (id: string) => marks().find((item) => item.id === id)
const selected = () => useViewStore.getState().selectedMarkIds
const onLayer = (layer: Mark['layer']) => marks().filter((item) => item.layer === layer)

/** Presses a key on the element, the page body by default, and returns true when the editor took the key. */
function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body) {
  return !fireEvent.keyDown(target, { key, cancelable: true, ...init })
}

function select(...ids: string[]) {
  act(() => useViewStore.getState().selectMarks(ids))
}

function fakePlayer(): WaveformPlayer & { playing: boolean } {
  const player = {
    playing: false,
    play: vi.fn(async () => {
      player.playing = true
    }),
    pause: vi.fn(() => {
      player.playing = false
    }),
    loop: vi.fn(async () => undefined),
    setPlayRate: vi.fn(),
    isPlaying: () => player.playing,
    media: document.createElement('audio'),
    setColors: vi.fn(),
    setView: vi.fn(),
    seek: vi.fn(),
    destroy: vi.fn(),
  }
  return player
}

let stopSelectionRule: () => void

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
  resetMarkUi()
  openSong()
  stopSelectionRule = keepSelectionInSong()
  render(<Editor />)
})

afterEach(() => stopSelectionRule())

describe('SHORTCUTS', () => {
  it('uses no key name in two entries', () => {
    const names = SHORTCUTS.flatMap((shortcut) => Object.keys(shortcut.keys))

    expect(new Set(names).size).toBe(names.length)
  })

  it('gives each key a function, except the keys that other components register', () => {
    const elsewhere = SHORTCUTS.flatMap((shortcut) =>
      Object.entries(shortcut.keys)
        .filter(([, run]) => run === null)
        .map(([name]) => name),
    )

    expect(elsewhere.sort()).toEqual(
      ['+', '-', '=', '?', 'Enter', 'Escape', 'F2', 'L', '[', ']', 'l'].sort(),
    )
    expect(Object.keys(SHORTCUT_KEYS)).toHaveLength(
      SHORTCUTS.flatMap((shortcut) => Object.keys(shortcut.keys)).length - elsewhere.length,
    )
  })

  it('has a label and an action for each entry', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.label).not.toBe('')
      expect(shortcut.action).not.toBe('')
    }
  })
})

describe('split and merge', () => {
  it('splits the selected word at the play cursor into two words with S', () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(3000))

    expect(press('s')).toBe(true)

    const words = onLayer('word').filter((word) => word.parentId === 'p1')
    expect(words).toHaveLength(3)
    expect(stored('w1')).toMatchObject({ startMs: 2000, endMs: 3000 })
    expect(selected()).toEqual(['w1'])
  })

  it('splits with the upper case S too', () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(3000))

    expect(press('S', { shiftKey: true })).toBe(true)
    expect(onLayer('word')).toHaveLength(4)
  })

  it('does not split when the play cursor is outside the mark, and leaves the key to the browser', () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(9000))

    expect(press('s')).toBe(false)
    expect(onLayer('word')).toHaveLength(3)
  })

  it('does not split when two marks are selected', () => {
    select('w1', 'w2')
    act(() => useViewStore.getState().setPlayTime(3000))

    expect(press('s')).toBe(false)
  })

  it('merges the selected word with the next word into one word that spans both with M', () => {
    select('w1')

    expect(press('m')).toBe(true)

    expect(stored('w1')).toMatchObject({ startMs: 2000, endMs: 7000, label: 'silentnight' })
    expect(stored('w2')).toBeUndefined()
    expect(selected()).toEqual(['w1'])
  })

  it('does not merge the last mark of a layer', () => {
    select('w3')

    expect(press('m')).toBe(false)
    expect(stored('w3')).toBeDefined()
  })
})

describe('Delete', () => {
  it('removes a phrase with its words and phonemes, empties the selection and focuses the layer track', async () => {
    select('p1')

    expect(press('Delete')).toBe(true)

    expect(marks().map((item) => item.id)).toEqual(['p2', 'w3', 'f4'])
    expect(selected()).toEqual([])
    await waitFor(() => expect(screen.getByRole('list', { name: 'Phrases' })).toHaveFocus())
  })

  it('does nothing with no selected mark', () => {
    expect(press('Delete')).toBe(false)
    expect(marks()).toHaveLength(MARKS.length)
  })

  it('keeps the last phoneme of a word selected, because the action keeps that phoneme', () => {
    select('f4')

    expect(press('Delete')).toBe(false)
    expect(selected()).toEqual(['f4'])
  })
})

describe('a focused form control', () => {
  /** Adds an input of the type to the page and focuses it. */
  function focusInput(type: string) {
    const input = document.body.appendChild(document.createElement('input'))
    input.type = type
    input.focus()
    return input
  }

  it.each(['range', 'checkbox', 'radio'])(
    'leaves S, M and Delete to a focused %s input',
    (type) => {
      select('w1')
      act(() => useViewStore.getState().setPlayTime(3000))
      const input = focusInput(type)
      try {
        expect(press('s', {}, input)).toBe(false)
        expect(press('m', {}, input)).toBe(false)
        expect(press('Delete', {}, input)).toBe(false)
        expect(marks()).toEqual(MARKS)
      } finally {
        input.remove()
      }
    },
  )

  it('deletes the selected mark with the focus on a button, because Delete does not press a button', () => {
    select('w3')

    expect(press('Delete', {}, screen.getByRole('button', { name: 'Undo' }))).toBe(true)
    expect(stored('w3')).toBeUndefined()
  })
})

describe('nudge', () => {
  it('moves the selected mark by one frame size with Left and Right', () => {
    select('w3')

    expect(press('ArrowRight')).toBe(true)
    expect(stored('w3')).toMatchObject({ startMs: 10_050, endMs: 12_050 })

    press('ArrowLeft')
    expect(stored('w3')).toMatchObject({ startMs: 10_000, endMs: 12_000 })
  })

  it('moves the start only with Alt and the end only with Shift and Alt', () => {
    select('w1')

    press('ArrowRight', { altKey: true })
    expect(stored('w1')).toMatchObject({ startMs: 2050, endMs: 4000 })

    press('ArrowLeft', { altKey: true, shiftKey: true })
    expect(stored('w1')).toMatchObject({ startMs: 2050, endMs: 3950 })
  })

  it('takes Alt+Left also when the mark cannot move, so the browser does not go back', () => {
    select('p1')

    expect(press('ArrowLeft', { altKey: true })).toBe(true)
    expect(stored('p1')).toMatchObject({ startMs: 0 })
  })

  it('leaves Alt+Left to the browser with no selected mark', () => {
    expect(press('ArrowLeft', { altKey: true })).toBe(false)
  })

  it('leaves the arrow keys to a focused slider', () => {
    select('w3')
    const slider = document.body.appendChild(document.createElement('input'))
    slider.type = 'range'
    try {
      expect(press('ArrowRight', {}, slider)).toBe(false)
      expect(stored('w3')).toMatchObject({ startMs: 10_000 })
    } finally {
      slider.remove()
    }
  })
})

describe('play cursor and time selection', () => {
  it('moves the play cursor by one frame size with no selected mark, and seeks the player', () => {
    const player = fakePlayer()
    attachPlayer(player)
    act(() => useViewStore.getState().setPlayTime(1020))

    expect(press('ArrowRight')).toBe(true)
    expect(useViewStore.getState().playTimeMs).toBe(1050)
    expect(player.seek).toHaveBeenCalledWith(1050)

    press('ArrowLeft')
    press('ArrowLeft')
    expect(useViewStore.getState().playTimeMs).toBe(950)
    detachPlayer(player)
  })

  it('makes a time selection from the play cursor with Shift and the arrow keys', () => {
    act(() => useViewStore.getState().setPlayTime(1000))

    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })
    expect(useViewStore.getState().selection).toEqual({ startMs: 1000, endMs: 1100 })

    press('ArrowLeft', { shiftKey: true })
    expect(useViewStore.getState().selection).toEqual({ startMs: 1000, endMs: 1050 })
  })
})

describe('Up and Down', () => {
  it('selects the parent with Up and the first child with Down', () => {
    select('w2')

    expect(press('ArrowUp')).toBe(true)
    expect(selected()).toEqual(['p1'])

    press('ArrowDown')
    press('ArrowDown')
    expect(selected()).toEqual(['f1'])
  })

  it('leaves Up to the browser on a phrase', () => {
    select('p1')

    expect(press('ArrowUp')).toBe(false)
    expect(selected()).toEqual(['p1'])
  })
})

describe('undo and redo', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z, and Cmd works the same', () => {
    select('w3')
    press('ArrowRight')

    expect(press('z', { ctrlKey: true })).toBe(true)
    expect(stored('w3')).toMatchObject({ startMs: 10_000 })

    expect(press('Z', { metaKey: true, shiftKey: true })).toBe(true)
    expect(stored('w3')).toMatchObject({ startMs: 10_050 })

    expect(press('z', { metaKey: true })).toBe(true)
    expect(stored('w3')).toMatchObject({ startMs: 10_000 })
  })

  it('undoes with Ctrl+Z when Caps Lock gives the upper case key', () => {
    select('w3')
    press('ArrowRight')

    press('Z', { ctrlKey: true })
    expect(stored('w3')).toMatchObject({ startMs: 10_000 })
  })

  it('leaves Ctrl+Z to the browser when the history has no step', () => {
    expect(press('z', { ctrlKey: true })).toBe(false)
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe(false)
  })

  it('restores the first state after 100 edits and 100 undo actions', () => {
    const first = useSongStore.getState().current
    select('w3')
    for (let edit = 0; edit < 100; edit += 1) press(edit % 4 < 2 ? 'ArrowRight' : 'ArrowLeft')
    expect(useSongStore.getState().history.past).toHaveLength(100)

    for (let undo = 0; undo < 100; undo += 1) press('z', { ctrlKey: true })

    expect(useSongStore.getState().current).toEqual(first)
  })

  it('does not undo during a mark drag', () => {
    select('w3')
    press('ArrowRight')
    const element = document.createElement('li')
    element.setPointerCapture = () => {}
    const event = { button: 0, pointerId: 1, clientX: 500, target: element, currentTarget: element }
    const { result } = renderHook(() => useMarkDrag('w3'))
    act(() => result.current.onPointerDown(event as unknown as PointerEvent<HTMLElement>))

    expect(press('z', { ctrlKey: true })).toBe(false)
    expect(press('Delete')).toBe(false)
    expect(stored('w3')).toMatchObject({ startMs: 10_050 })

    act(() => result.current.onPointerCancel())
    expect(press('z', { ctrlKey: true })).toBe(true)
  })

  it('does not undo while the phoneme label list is open', () => {
    select('w3')
    press('ArrowRight')
    act(() =>
      useMarkUiStore.getState().openLabel({ control: 'menu', target: { kind: 'edit', id: 'f4' } }),
    )

    expect(press('z', { ctrlKey: true })).toBe(false)
    expect(stored('w3')).toMatchObject({ startMs: 10_050 })
  })

  it('leaves Ctrl+Z to a focused text field', () => {
    select('w3')
    press('ArrowRight')
    const field = document.body.appendChild(document.createElement('input'))
    try {
      expect(press('z', { ctrlKey: true }, field)).toBe(false)
      expect(stored('w3')).toMatchObject({ startMs: 10_050 })
    } finally {
      field.remove()
    }
  })

  it('disables Undo and Redo when the history has no step in their direction', async () => {
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAccessibleDescription(
      'No step to undo.',
    )
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveAccessibleDescription(
      'No step to redo.',
    )
    select('w3')
    act(() => {
      press('ArrowRight')
    })

    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    await waitFor(() => expect(undo).not.toHaveAttribute('aria-disabled'))
    await user.click(undo)
    expect(stored('w3')).toMatchObject({ startMs: 10_000 })
    await waitFor(() => expect(undo).toHaveAttribute('aria-disabled', 'true'))

    await waitFor(() => expect(redo).not.toHaveAttribute('aria-disabled'))
    await user.click(redo)
    expect(stored('w3')).toMatchObject({ startMs: 10_050 })
    await waitFor(() => expect(redo).toHaveAttribute('aria-disabled', 'true'))
  })
})

describe('Space', () => {
  it('plays and pauses the player of the editor', () => {
    const player = fakePlayer()
    attachPlayer(player)

    expect(press(' ')).toBe(true)
    expect(player.play).toHaveBeenCalledOnce()
    press(' ')
    expect(player.pause).toHaveBeenCalledOnce()
    detachPlayer(player)
  })

  it('toggles one time for a held key', () => {
    const player = fakePlayer()
    attachPlayer(player)

    press(' ')
    expect(press(' ', { repeat: true })).toBe(true)
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.pause).not.toHaveBeenCalled()
    detachPlayer(player)
  })

  it('leaves the space bar to a focused button and to a text field', async () => {
    const user = userEvent.setup()
    const player = fakePlayer()
    attachPlayer(player)
    const field = document.body.appendChild(document.createElement('input'))
    try {
      expect(press(' ', {}, screen.getByRole('button', { name: 'Undo' }))).toBe(false)
      await user.click(field)
      await user.keyboard(' ')

      expect(field).toHaveValue(' ')
      expect(player.play).not.toHaveBeenCalled()
    } finally {
      field.remove()
      detachPlayer(player)
    }
  })

  it('plays from a focused button of the toolbar other than "Play", and leaves the button unpressed', () => {
    const player = fakePlayer()
    attachPlayer(player)
    const toolbar = document.body.appendChild(document.createElement('div'))
    toolbar.className = 'editor-toolbar'
    const speed = toolbar.appendChild(document.createElement('button'))
    const menu = toolbar.appendChild(document.createElement('div'))
    menu.setAttribute('role', 'menu')
    const item = menu.appendChild(document.createElement('button'))
    const transport = document.body.appendChild(document.createElement('div'))
    transport.className = 'transport'
    const play = transport.appendChild(document.createElement('button'))
    play.className = 'play'
    try {
      expect(press(' ', {}, speed)).toBe(true)
      expect(player.play).toHaveBeenCalledOnce()
      expect(press(' ', {}, item)).toBe(false)
      expect(press(' ', {}, play)).toBe(false)
      expect(player.pause).not.toHaveBeenCalled()
    } finally {
      toolbar.remove()
      transport.remove()
      detachPlayer(player)
    }
  })

  it('starts no play inside a dialog', () => {
    const player = fakePlayer()
    attachPlayer(player)
    const dialog = document.body.appendChild(document.createElement('div'))
    dialog.setAttribute('role', 'dialog')
    try {
      expect(press(' ', {}, dialog)).toBe(false)
      expect(player.play).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
      detachPlayer(player)
    }
  })

  it('pauses the player when the browser refuses the play', async () => {
    const player = fakePlayer()
    vi.mocked(player.play).mockRejectedValueOnce(new DOMException('refused', 'NotAllowedError'))
    attachPlayer(player)
    try {
      expect(press(' ')).toBe(true)

      await waitFor(() => expect(player.pause).toHaveBeenCalledOnce())
      expect(player.isPlaying()).toBe(false)
    } finally {
      detachPlayer(player)
    }
  })

  it('leaves the space bar to the browser while the audio is not ready', () => {
    expect(press(' ')).toBe(false)
  })
})

describe('ShortcutList', () => {
  it('opens with ? and closes with Escape, and gives the focus back', async () => {
    const user = userEvent.setup()
    const word = within(screen.getByRole('list', { name: 'Words' })).getAllByRole('listitem')[0]
    act(() => word?.focus())

    await user.keyboard('?')

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Split the selected mark at the play cursor')).toBeVisible()
    expect(within(dialog).getByText('On macOS, use Cmd in place of Ctrl.')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(word).toHaveFocus()
  })

  it('shows one row for each entry of the table', async () => {
    const user = userEvent.setup()
    await user.keyboard('?')

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    for (const shortcut of SHORTCUTS)
      expect(within(dialog).getByText(shortcut.label, { selector: 'kbd' })).toBeInTheDocument()
  })

  it('stops the editor keys while it is open', async () => {
    const user = userEvent.setup()
    select('w3')
    await user.keyboard('?')
    const close = await screen.findByRole('button', { name: 'Close' })

    expect(press('ArrowRight', {}, close)).toBe(false)
    expect(stored('w3')).toMatchObject({ startMs: 10_000 })
  })

  it('closes with the Close button', async () => {
    const user = userEvent.setup()
    await user.keyboard('?')

    await user.click(await screen.findByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
