import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { PHONEME_LABELS, type PhonemeLabel } from '../../lib/dictionary/cmuSymbols.ts'

type PhonemeLabelMenuProps = {
  /** The label of the phoneme now. The list starts on it. Undefined starts on the first label. */
  current: string | undefined
  /** Receives the label that the person chooses. */
  onChoose: (label: PhonemeLabel) => void
  /** Receives `Escape`, or a focus that leaves the list. */
  onClose: () => void
}

const LAST = PHONEME_LABELS.length - 1

/**
 * Shows the ten phoneme labels as a list box with the focus.
 * The arrow keys, `Home` and `End` move the active label. `Enter` or a click chooses a label. `Escape` closes the list.
 */
export function PhonemeLabelMenu({ current, onChoose, onClose }: PhonemeLabelMenuProps) {
  const id = useId()
  const list = useRef<HTMLUListElement>(null)
  // React moves the focus for `autoFocus` only on a form control, so the list takes the focus here.
  // The list opens from a click or a key, so the person chooses at once.
  useEffect(() => list.current?.focus(), [])
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
    else if (event.key === 'Escape') onClose()
    else return
    // The editor keys must not also act on a key that the list uses.
    event.preventDefault()
  }

  return (
    <ul
      className="phoneme-menu"
      role="listbox"
      aria-label="Phoneme label"
      aria-activedescendant={`${id}-${active}`}
      ref={list}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={onClose}
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
    </ul>
  )
}
