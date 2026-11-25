import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { menuPosition } from '../../lib/layout/menuPosition.ts'

type FloatingMenuProps = {
  /** The button that opens the menu. The menu opens next to it, by `menuPosition`. */
  anchor: RefObject<HTMLElement | null>
  /** Receives a press outside the menu and outside the anchor, with `refocus` false. */
  onClose: (refocus: boolean) => void
  children: ReactNode
}

/**
 * Shows a menu of the editor in a portal with a fixed position, so that the stage or the rail cannot clip it.
 * The rules:
 * - Each render places the menu again, because a new list in the menu can change its size.
 * - A scroll or a resize of the window places the menu again, so the menu follows its anchor.
 * - A press outside the menu and the anchor closes the menu. The anchor toggles the menu itself.
 * - `Tab` and `Shift+Tab` start from the anchor, so the Tab order is the same as for a menu next to its anchor.
 */
export function FloatingMenu({ anchor, onClose, children }: FloatingMenuProps) {
  const layer = useRef<HTMLDivElement>(null)

  // No dependency list: the size of the menu can change at each render.
  useLayoutEffect(() => {
    function place() {
      const element = layer.current
      const box = anchor.current?.getBoundingClientRect()
      if (!element || !box) return
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      const view = { width: window.innerWidth, height: window.innerHeight }
      const position = menuPosition(box, size, view)
      element.style.top = `${position.top}px`
      element.style.left = `${position.left}px`
    }
    place()
    // A scroll event does not bubble, so only the capture phase sees the scroll of the stage or the page.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  })

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const { target } = event
      if (!(target instanceof Node)) return
      if (layer.current?.contains(target) || anchor.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [anchor, onClose])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    // The focus leaves the menu, so the menu closes. The browser then moves on from the anchor.
    anchor.current?.focus()
    if (event.shiftKey) event.preventDefault()
  }

  return createPortal(
    <div ref={layer} className="floating-menu" onKeyDown={onKeyDown}>
      {children}
    </div>,
    document.body,
  )
}
