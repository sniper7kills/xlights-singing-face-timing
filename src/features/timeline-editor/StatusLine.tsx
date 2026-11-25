import { useEffect } from 'react'
import { clearStatus, useStatusStore } from './statusStore.ts'

/** The time that a status text stays, in milliseconds. */
export const STATUS_MS = 5000

/**
 * Shows the status line of the editor: a polite live region with the reason that a key, a button or a drag did nothing.
 * The text goes away after `STATUS_MS`, or at the next key or pointer press.
 */
export function StatusLine() {
  const text = useStatusStore((state) => state.text)
  const count = useStatusStore((state) => state.count)

  useEffect(() => {
    if (text === null) return
    const timer = window.setTimeout(clearStatus, STATUS_MS)
    return () => window.clearTimeout(timer)
  }, [text, count])

  useEffect(() => {
    // The capture phase runs before the editor keys and the pointer handlers, so an action that reports a new text keeps it.
    window.addEventListener('keydown', clearStatus, true)
    window.addEventListener('pointerdown', clearStatus, true)
    return () => {
      window.removeEventListener('keydown', clearStatus, true)
      window.removeEventListener('pointerdown', clearStatus, true)
    }
  }, [])

  return (
    <p className="status-line" role="status" aria-live="polite">
      {text}
    </p>
  )
}
