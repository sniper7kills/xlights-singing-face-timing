import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PHONEME_LABELS, type PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'

type PhonemeLabelMenuProps = {
  /** The label of the phoneme now. The list starts on it. Undefined starts on the first label. */
  current: string | undefined
  /** Receives the label that the person chooses. */
  onChoose: (label: PhonemeLabel) => void
  /**
   * Receives `Escape`, or a focus that leaves the list.
   * `refocus` is false when the focus goes to another control, so the mark must not take it back.
   */
  onClose: (refocus: boolean) => void
  /** The element at the left edge of the phoneme, inside its layer row. The list opens under or over that row. */
  anchor: RefObject<HTMLElement | null>
}

/** The space between the list, the layer row and the window edge, in pixels. */
const GAP_PX = 4

type Box = { top: number; bottom: number; left: number }

/**
 * Returns the window position of the list: under the layer row when it fits in the window, else over the row.
 * The list stays inside the window width.
 * @param row The box of the layer row in the window.
 * @param size The width and the height of the list.
 * @param view The width and the height of the window.
 */
export function menuPosition(
  row: Box,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { top: number; left: number } {
  const below = row.bottom + GAP_PX
  const top =
    below + size.height <= view.height ? below : Math.max(GAP_PX, row.top - size.height - GAP_PX)
  const left = Math.max(GAP_PX, Math.min(row.left, view.width - size.width - GAP_PX))
  return { top, left }
}

const LAST = PHONEME_LABELS.length - 1

/**
 * Shows the ten phoneme labels as a list box with the focus.
 * The list has a fixed position in the window, outside the stage, so it does not change the scroll of the stage.
 * The arrow keys, `Home` and `End` move the active label. `Enter` or a click chooses a label. `Escape` closes the list.
 */
export function PhonemeLabelMenu({ current, onChoose, onClose, anchor }: PhonemeLabelMenuProps) {
  const id = useId()
  const list = useRef<HTMLUListElement>(null)
  // A layout effect of a child runs before React sets the ref of the parent, so the anchor is ready only here.
  useEffect(() => {
    const menu = list.current
    const row = anchor.current?.parentElement?.getBoundingClientRect()
    const left = anchor.current?.getBoundingClientRect().left
    if (!menu || !row || left === undefined) return
    const size = { width: menu.offsetWidth, height: menu.offsetHeight }
    const view = { width: window.innerWidth, height: window.innerHeight }
    const position = menuPosition({ top: row.top, bottom: row.bottom, left }, size, view)
    menu.style.top = `${position.top}px`
    menu.style.left = `${position.left}px`
    // React moves the focus for `autoFocus` only on a form control, so the list takes the focus here.
    // The list opens from a click or a key, so the person chooses at once. A scroll would move the stage.
    menu.focus({ preventScroll: true })
  }, [anchor])
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      PHONEME_LABELS.findIndex((label) => label === current),
    ),
  )
  const moves: Record<string, () => number> = {
    ArrowDown: () => Math.min(LAST, active + 1),
    ArrowRight: () => Math.min(LAST, active + 1),
    ArrowUp: () => Math.max(0, active - 1),
    ArrowLeft: () => Math.max(0, active - 1),
    Home: () => 0,
    End: () => LAST,
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const move = moves[event.key]
    const label = PHONEME_LABELS[active]
    if (move) setActive(move())
    else if ((event.key === 'Enter' || event.key === ' ') && label) onChoose(label)
    else if (event.key === 'Escape') onClose(true)
    else return
    // The editor keys must not also act on a key that the list uses.
    event.preventDefault()
  }

  return createPortal(
    <ul
      className="phoneme-menu"
      role="listbox"
      aria-label="Phoneme label"
      aria-activedescendant={`${id}-${active}`}
      ref={list}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={(event) => onClose(event.relatedTarget === null)}
    >
      {PHONEME_LABELS.map((label, index) => (
        <li
          key={label}
          id={`${id}-${index}`}
          role="option"
          className="phoneme-option"
          data-label={label}
          aria-selected={index === active}
          // The list keeps the focus, so a press does not close it before the click.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(label)}
        >
          {label}
        </li>
      ))}
    </ul>,
    document.body,
  )
}
