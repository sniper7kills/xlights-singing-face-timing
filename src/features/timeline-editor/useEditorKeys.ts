import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * The editor shortcuts of one component: a key name and the function that it runs.
 * A key name is the `KeyboardEvent.key` value with the modifier prefixes `Ctrl+`, `Alt+`
 * and `Shift+`, in that order, for example `+`, `Tab`, `Shift+Tab`, `Alt+ArrowLeft` or `Ctrl+z`.
 * `Ctrl+` also stands for `Cmd` on macOS.
 * A single character has no `Shift+` prefix, because the character already shows the Shift key:
 * `+` and `?` need Shift on most keyboards, and `Ctrl+Shift+Z` is `Ctrl+Z`.
 */
export type EditorKeyMap = Readonly<Record<string, (event: KeyboardEvent) => void>>

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

/** Returns the key name of `event` in the format of `EditorKeyMap`. */
export function keyName(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && event.key.length > 1) parts.push('Shift')
  parts.push(event.key)
  return parts.join('+')
}

/** Returns true when the focus is in a text field, a select, an editable element or a dialog. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(TEXT_CONTROLS) !== null) return true
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
}

function dispatch(event: KeyboardEvent) {
  if (event.defaultPrevented || isTextTarget(event.target)) return
  const name = keyName(event)
  for (const keys of registered) {
    const run = keys.current[name]
    if (run === undefined) continue
    // The browser has its own action for some keys, for example `-` with Ctrl or Tab.
    event.preventDefault()
    run(event)
    return
  }
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
