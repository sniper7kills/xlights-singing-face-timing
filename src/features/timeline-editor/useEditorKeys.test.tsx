import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { type EditorKeyMap, keyName, useEditorKeys } from './useEditorKeys.ts'

function Keys({ keys }: { keys: EditorKeyMap }) {
  useEditorKeys(keys)
  return null
}

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('keyName', () => {
  it('names a key with the Ctrl, Alt and Shift prefixes in that order', () => {
    expect(keyName(key({ key: 'ArrowLeft', altKey: true, shiftKey: true }))).toBe(
      'Alt+Shift+ArrowLeft',
    )
    expect(keyName(key({ key: 'Tab', shiftKey: true }))).toBe('Shift+Tab')
    expect(keyName(key({ key: 'z', ctrlKey: true }))).toBe('Ctrl+z')
  })

  it('names Cmd as Ctrl', () => {
    expect(keyName(key({ key: 'z', metaKey: true }))).toBe('Ctrl+z')
  })

  it('gives a single character no Shift prefix', () => {
    expect(keyName(key({ key: '+', shiftKey: true }))).toBe('+')
    expect(keyName(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Z')
  })
})

describe('keyName with AltGr and the Mac Option key', () => {
  it('names a character that AltGr typed with no prefix', () => {
    expect(keyName(key({ key: '[', modifierAltGraph: true }))).toBe('[')
    expect(keyName(key({ key: ']', modifierAltGraph: true, ctrlKey: true, altKey: true }))).toBe(
      ']',
    )
  })

  it('names a symbol with Ctrl and Alt as the bare symbol, because Windows sets both for AltGr', () => {
    expect(keyName(key({ key: '[', ctrlKey: true, altKey: true }))).toBe('[')
    expect(keyName(key({ key: ']', ctrlKey: true, altKey: true }))).toBe(']')
  })

  it('keeps the prefixes of a letter with Ctrl and Alt', () => {
    expect(keyName(key({ key: 'z', ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+z')
  })

  it('keeps the shortcuts of the editor', () => {
    expect(keyName(key({ key: 'z', ctrlKey: true }))).toBe('Ctrl+z')
    expect(keyName(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Z')
    expect(keyName(key({ key: 'ArrowLeft', altKey: true }))).toBe('Alt+ArrowLeft')
    expect(keyName(key({ key: 'ArrowRight', altKey: true, shiftKey: true }))).toBe(
      'Alt+Shift+ArrowRight',
    )
  })
})

describe('useEditorKeys', () => {
  it('runs the function of `[` and `]` for AltGr on Windows', () => {
    const previous = vi.fn()
    const next = vi.fn()
    render(<Keys keys={{ '[': previous, ']': next }} />)

    window.dispatchEvent(key({ key: '[', ctrlKey: true, altKey: true }))
    window.dispatchEvent(key({ key: ']', modifierAltGraph: true }))

    expect(previous).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })

  it('runs the function of `[` for the Mac Option key, and cancels the browser action', () => {
    const previous = vi.fn()
    render(<Keys keys={{ '[': previous }} />)

    const event = key({ key: '[', altKey: true, cancelable: true })
    window.dispatchEvent(event)

    expect(previous).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('runs a registered Alt shortcut of a symbol before the bare symbol', () => {
    const bare = vi.fn()
    const withAlt = vi.fn()
    render(<Keys keys={{ '[': bare, 'Alt+[': withAlt }} />)

    window.dispatchEvent(key({ key: '[', altKey: true }))

    expect(withAlt).toHaveBeenCalledOnce()
    expect(bare).not.toHaveBeenCalled()
  })

  it('gives a letter with the Option key no bare name', () => {
    const letter = vi.fn()
    render(<Keys keys={{ e: letter }} />)

    window.dispatchEvent(key({ key: 'e', altKey: true }))

    expect(letter).not.toHaveBeenCalled()
  })

  it('still runs Ctrl+Z, Ctrl+Shift+Z, Alt+Left and Shift+Alt+Right', () => {
    const undo = vi.fn()
    const redo = vi.fn()
    const start = vi.fn()
    const end = vi.fn()
    render(
      <Keys
        keys={{
          'Ctrl+z': undo,
          'Ctrl+Z': redo,
          'Alt+ArrowLeft': start,
          'Alt+Shift+ArrowRight': end,
        }}
      />,
    )

    window.dispatchEvent(key({ key: 'z', ctrlKey: true }))
    window.dispatchEvent(key({ key: 'Z', ctrlKey: true, shiftKey: true }))
    window.dispatchEvent(key({ key: 'ArrowLeft', altKey: true }))
    window.dispatchEvent(key({ key: 'ArrowRight', altKey: true, shiftKey: true }))

    expect([undo, redo, start, end].map((action) => action.mock.calls.length)).toEqual([1, 1, 1, 1])
  })

  it('runs the function of a registered key and cancels the browser action', () => {
    const plus = vi.fn()
    render(<Keys keys={{ '+': plus }} />)

    const event = new KeyboardEvent('keydown', { key: '+', cancelable: true })
    window.dispatchEvent(event)

    expect(plus).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('gives a key to the browser and to the next registration when a function returns false', () => {
    const declined = vi.fn(() => false)
    const next = vi.fn()
    render(
      <>
        <Keys keys={{ Tab: declined }} />
        <Keys keys={{ Tab: next }} />
      </>,
    )

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    window.dispatchEvent(event)

    expect(declined).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a key to the browser when every function returns false', () => {
    render(<Keys keys={{ Tab: () => false }} />)

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves a key that no component registers to the browser', () => {
    render(<Keys keys={{ '+': vi.fn() }} />)

    const event = new KeyboardEvent('keydown', { key: 'x', cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('runs the keys of two components from one dispatcher', async () => {
    const plus = vi.fn()
    const tab = vi.fn()
    render(
      <>
        <Keys keys={{ '+': plus }} />
        <Keys keys={{ Tab: tab }} />
      </>,
    )

    await userEvent.keyboard('+{Tab}')

    expect(plus).toHaveBeenCalledOnce()
    expect(tab).toHaveBeenCalledOnce()
  })

  it('uses the newest functions after a render', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Keys keys={{ '-': first }} />)
    view.rerender(<Keys keys={{ '-': second }} />)

    await userEvent.keyboard('-')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it.each([
    ['a text area', <textarea key="t" aria-label="Field" />],
    [
      'a select',
      <select key="s" aria-label="Field">
        <option>One</option>
      </select>,
    ],
    ['an editable element', <div key="e" aria-label="Field" contentEditable tabIndex={0} />],
    ['a text input', <input key="i" type="search" aria-label="Field" />],
  ])('ignores a key when the focus is in %s', async (_name, field) => {
    const plus = vi.fn()
    render(
      <>
        <Keys keys={{ '+': plus }} />
        {field}
      </>,
    )
    screen.getByLabelText('Field').focus()

    await userEvent.keyboard('+')

    expect(plus).not.toHaveBeenCalled()
  })

  it('runs a key when the focus is on a checkbox or a range input', async () => {
    const plus = vi.fn()
    render(
      <>
        <Keys keys={{ '+': plus }} />
        <input type="checkbox" aria-label="Box" />
        <input type="range" aria-label="Range" />
      </>,
    )

    screen.getByLabelText('Box').focus()
    await userEvent.keyboard('+')
    screen.getByLabelText('Range').focus()
    await userEvent.keyboard('+')

    expect(plus).toHaveBeenCalledTimes(2)
  })
})
