import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { SHORTCUT_KEYS } from './editorShortcuts.ts'
import { resetMarkUi } from './markUiStore.ts'
import { menuPosition } from './PhonemeLabelMenu.tsx'
import { STATUS_MS, StatusLine } from './StatusLine.tsx'
import { reportStatus } from './statusStore.ts'
import { useEditorKeys } from './useEditorKeys.ts'
import { useMarkDrag } from './useMarkDrag.ts'

const VOICE = 'song-1-voice'

function mark(id: string, fields: Partial<Mark> & Pick<Mark, 'layer' | 'startMs' | 'endMs'>): Mark {
  return { id, voiceId: VOICE, label: id, parentId: null, edited: false, ...fields }
}

// "night" touches "silent" and the phrase end, so it has no room to move.
const MARKS: Mark[] = [
  mark('p1', { layer: 'phrase', label: 'silent night', startMs: 2000, endMs: 8000 }),
  mark('w1', { layer: 'word', label: 'silent', startMs: 2000, endMs: 4000, parentId: 'p1' }),
  mark('w2', { layer: 'word', label: 'night', startMs: 4000, endMs: 8000, parentId: 'p1' }),
  mark('f1', { layer: 'phoneme', label: 'etc', startMs: 2000, endMs: 3000, parentId: 'w1' }),
  mark('f2', { layer: 'phoneme', label: 'AI', startMs: 3000, endMs: 4000, parentId: 'w1' }),
  mark('f3', { layer: 'phoneme', label: 'etc', startMs: 4000, endMs: 8000, parentId: 'w2' }),
]

function Editor() {
  useEditorKeys(SHORTCUT_KEYS)
  return <StatusLine />
}

const status = () => screen.getByRole('status')

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, cancelable: true, ...init })
}

function select(...ids: string[]) {
  act(() => useViewStore.getState().selectMarks(ids))
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
  resetMarkUi()
  const content = makeSongContent()
  useSongStore.setState({
    current: { ...content, song: { ...content.song, durationMs: 20_000 }, marks: MARKS },
    history: emptyHistory(),
  })
  render(<Editor />)
})

afterEach(() => vi.useRealTimers())

describe('StatusLine', () => {
  it('is a polite live region', () => {
    expect(status()).toHaveAttribute('aria-live', 'polite')
  })

  it('clears the text after a few seconds', () => {
    vi.useFakeTimers()
    act(() => reportStatus('This is the last mark of the layer.'))
    expect(status()).toHaveTextContent('This is the last mark of the layer.')

    act(() => vi.advanceTimersByTime(STATUS_MS))

    expect(status()).toHaveTextContent('')
  })

  it('clears the text at the next pointer press', () => {
    act(() => reportStatus('This is the last mark of the layer.'))

    fireEvent.pointerDown(document.body)

    expect(status()).toHaveTextContent('')
  })
})

describe('the reason of a key that does nothing', () => {
  it('asks for the play cursor in the mark after S', () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(0))

    press('s')

    expect(status()).toHaveTextContent('Move the play cursor into the mark. Then press S.')
  })

  it('names the last mark of the layer after M', () => {
    select('w2')

    press('m')

    expect(status()).toHaveTextContent('This is the last mark of the layer.')
  })

  it('asks to delete the word after Delete on its last phoneme', () => {
    select('f3')

    press('Delete')

    expect(status()).toHaveTextContent('A word needs one phoneme or more. Delete the word.')
  })

  it('names a mark and an edge with no room to move after the nudge keys', () => {
    select('w2')

    press('ArrowRight')
    expect(status()).toHaveTextContent('The mark has no room to move.')

    press('ArrowRight', { altKey: true, shiftKey: true })
    expect(status()).toHaveTextContent('The edge of the mark has no room to move.')
  })

  it('clears the text at the next key', () => {
    select('w2')
    press('m')

    press('x')

    expect(status()).toHaveTextContent('')
  })
})

describe('the reason of a drag that does nothing', () => {
  function pointer(clientX: number) {
    const element = document.createElement('li')
    element.setPointerCapture = () => {}
    return {
      button: 0,
      pointerId: 1,
      clientX,
      shiftKey: false,
      target: element,
      currentTarget: element,
    } as unknown as PointerEvent<HTMLElement>
  }

  it('names a mark with no room to move after a drag of its body', () => {
    const { result } = renderHook(() => useMarkDrag('w2'))

    act(() => {
      result.current.onPointerDown(pointer(500))
      result.current.onPointerMove(pointer(600))
      result.current.onPointerUp(pointer(600))
    })

    expect(status()).toHaveTextContent('The mark has no room to move.')
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})

describe('menuPosition', () => {
  const view = { width: 1200, height: 800 }
  const size = { width: 300, height: 100 }

  it('opens under the layer row when the list fits in the window', () => {
    expect(menuPosition({ top: 400, bottom: 430, left: 50 }, size, view)).toEqual({
      top: 434,
      left: 50,
    })
  })

  it('opens over the layer row near the window bottom, and stays inside the window width', () => {
    expect(menuPosition({ top: 700, bottom: 730, left: 1100 }, size, view)).toEqual({
      top: 596,
      left: 896,
    })
  })
})
