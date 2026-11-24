import type { KeyboardEvent } from 'react'

const FOCUSABLE = 'button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])'

/**
 * Returns the controls of a modal dialog that Tab visits, in order.
 * Tab visits only the checked radio of a group, and no hidden or disabled control.
 * @param container The dialog element.
 */
export function tabStops(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.matches(':disabled') &&
      !element.hidden &&
      !(element instanceof HTMLInputElement && element.type === 'radio' && !element.checked),
  )
}

/**
 * Keeps the focus inside a modal dialog: Tab on the last control goes to the first, and Shift+Tab on the first goes to the last.
 * Shift+Tab also goes to the last control when the dialog element has the focus.
 * @param event The Tab key event of the dialog element.
 */
export function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
  const controls = tabStops(event.currentTarget)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (first === undefined || last === undefined) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
