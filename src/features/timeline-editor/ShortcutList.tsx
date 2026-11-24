import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'
import { SHORTCUT_KEYS, SHORTCUTS } from './editorShortcuts.ts'
import { useEditorKeys } from './useEditorKeys.ts'

/** Shows the shortcut list dialog. When the dialog closes, the focus goes back to the element that had it before. */
function ShortcutDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  // The first render runs before `autoFocus` moves the focus, so it still sees the element that had the focus.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [opener])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    // The backdrop keeps the focus in the dialog, so a press outside it does not reach the editor.
    <div className="modal-backdrop" onMouseDown={(event) => event.preventDefault()}>
      <div
        className="dialog shortcut-list"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>Keyboard shortcuts</h3>
        <dl>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label}>
              <dt>
                <kbd>{shortcut.label}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <p>On macOS, use Cmd in place of Ctrl.</p>
        <div className="dialog-actions">
          <button type="button" className="button primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Registers the editor shortcuts of `SHORTCUTS` and the `?` key, and shows the shortcut list while it is open.
 * The dispatcher ignores keys inside a dialog, so the editor keys stop while the list is open.
 */
export function ShortcutList() {
  const [open, setOpen] = useState(false)
  useEditorKeys({ ...SHORTCUT_KEYS, '?': () => setOpen(true) })
  return open ? <ShortcutDialog onClose={() => setOpen(false)} /> : null
}
