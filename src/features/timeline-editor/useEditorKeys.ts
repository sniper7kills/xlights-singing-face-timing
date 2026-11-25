import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * The editor shortcuts of one component: a key name and the function that it runs.
 * A key name is the `KeyboardEvent.key` value with the modifier prefixes `Ctrl+`, `Alt+`
 * and `Shift+`, in that order, for example `+`, `Tab`, `Shift+Tab`, `Alt+ArrowLeft` or `Ctrl+z`.
 * `Ctrl+` also stands for `Cmd` on macOS.
 * A single character has no `Shift+` prefix, because the character already shows the Shift key:
 * `+` and `?` need Shift on most keyboards, and `Ctrl+Shift+Z` is `Ctrl+Z`.
 * A symbol that AltGr types, or that the Mac Option key types, is the bare character too,
 * for example `[` from AltGr+8 or Option+5 on a German keyboard.
 * A function that returns `false` does not take the key: the browser action and the next registration get it.
 * For example, `Enter` on a mark opens its label control, and `Enter` on a button presses the button.
 */
export type EditorKeyMap = Readonly<Record<string, (event: KeyboardEvent) => boolean | void>>

// A focused text field uses these keys for its text, so the editor must not take them.
const TEXT_CONTROLS =
  'textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]'

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

const registered = new Set<{ current: EditorKeyMap }>()

// A letter, a digit or a space with Ctrl and Alt is a shortcut, not a typed character.
const LETTER_OR_DIGIT = /[\p{L}\p{N}\s]/u

/**
 * Returns true when the AltGr key typed the character of `event`.
 * Windows sets Ctrl and Alt for AltGr, for example AltGr+8 for `[` on a German keyboard.
 */
function isAltGrCharacter(event: KeyboardEvent): boolean {
  if (event.key.length !== 1 || event.metaKey) return false
  if (event.getModifierState('AltGraph')) return true
  return event.ctrlKey && event.altKey && !LETTER_OR_DIGIT.test(event.key)
}

/**
 * Returns the key name of `event` in the format of `EditorKeyMap`.
 * A character that AltGr typed has no `Ctrl+` and no `Alt+` prefix, so `[` and `]` work on each keyboard layout.
 */
export function keyName(event: KeyboardEvent): string {
  if (isAltGrCharacter(event)) return event.key
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && event.key.length > 1) parts.push('Shift')
  parts.push(event.key)
  return parts.join('+')
}

/**
 * Returns the character of `event` when the Option key of a Mac typed it, else null.
 * Option+5 types `[` on a German Mac keyboard, and the event has Alt only. The dispatcher
 * tries this name after the full key name, so a registered `Alt+<character>` shortcut wins.
 */
function optionCharacter(event: KeyboardEvent): string | null {
  const typed =
    event.key.length === 1 &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !LETTER_OR_DIGIT.test(event.key)
  return typed ? event.key : null
}

/** Returns true when the focus is in a text field, a select, an editable element or a dialog. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(TEXT_CONTROLS) !== null) return true
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
}

function dispatch(event: KeyboardEvent) {
  if (event.defaultPrevented || isTextTarget(event.target)) return
  const fallback = optionCharacter(event)
  if (run(keyName(event), event) || fallback === null) return
  run(fallback, event)
}

/** Runs the first registered function of the key name that takes the key, and returns true when one took it. */
function run(name: string, event: KeyboardEvent): boolean {
  for (const keys of registered) {
    const action = keys.current[name]
    if (action === undefined || action(event) === false) continue
    // The browser has its own action for some keys, for example `-` with Ctrl or Tab.
    event.preventDefault()
    return true
  }
  return false
}

/**
 * Registers editor shortcuts with the one key dispatcher of the editor while the component is mounted.
 * The dispatcher listens on the window. It ignores a key when the focus is in a text field,
 * a select, an editable element or a dialog. When two components register the same key name,
 * the component that registered first runs.
 * @param keys The key names and their functions. A new object on each render is allowed.
 */
export function useEditorKeys(keys: EditorKeyMap): void {
  const latest = useRef(keys)
  useLayoutEffect(() => {
    latest.current = keys
  })
  useEffect(() => {
    const entry = latest
    if (registered.size === 0) window.addEventListener('keydown', dispatch)
    registered.add(entry)
    return () => {
      registered.delete(entry)
      if (registered.size === 0) window.removeEventListener('keydown', dispatch)
    }
  }, [])
}
