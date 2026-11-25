import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { VOICE_COLOR_NAMES, VOICE_COLORS } from '../../lib/voices/voiceRules.ts'
import { setVoiceColor } from '../../store/actions/voices.ts'
import type { Voice } from '../../store/types.ts'

type VoiceMenuProps = {
  voice: Voice
  /** True for the first row. "Move up" is then disabled. */
  first: boolean
  /** True for the last row. "Move down" is then disabled. */
  last: boolean
  /** False for the only voice of the song. The menu then has no "Delete". */
  canDelete: boolean
  onRename: () => void
  /** Receives -1 for "Move up" and 1 for "Move down". */
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
  /**
   * Receives `Escape`, a chosen colour, or a focus that leaves the menu.
   * `refocus` is false when the focus goes to another control, so the menu button must not take it back.
   */
  onClose: (refocus: boolean) => void
}

type Item = {
  label: string
  run: () => void
  disabled?: boolean
  /** The value of `aria-checked` for a colour. Undefined for an action. */
  checked?: boolean
  color?: string
}

const ITEM_SELECTOR = '[role^="menuitem"]'

/** Returns the index of the item that `key` moves the focus to, or undefined for another key. */
function nextIndex(key: string, index: number, count: number): number | undefined {
  const moves: Record<string, number> = {
    ArrowDown: (index + 1) % count,
    ArrowUp: (index - 1 + count) % count,
    Home: 0,
    End: count - 1,
  }
  return moves[key]
}

/**
 * Shows the menu of a voice row: "Rename", "Colour", "Move up", "Move down" and "Delete".
 * "Colour" shows the 8 preset colours in the same menu, each with its colour name.
 * The arrow keys, `Home` and `End` move the focus. `Enter` or `Space` runs the item. `Escape` closes the menu.
 * The menu takes each key except `Tab`, so the editor shortcuts do not act while it is open.
 */
export function VoiceMenu(props: VoiceMenuProps) {
  const { voice, first, last, canDelete, onRename, onMove, onDelete, onClose } = props
  const [colours, setColours] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The menu opens from a click or a key, so the focus goes to the checked colour or the first item.
    const checked = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    ;(checked ?? menu.current?.querySelector<HTMLElement>(ITEM_SELECTOR))?.focus()
  }, [colours])

  const actions: Item[] = [
    { label: 'Rename', run: onRename },
    { label: 'Colour', run: () => setColours(true) },
    { label: 'Move up', run: () => onMove(-1), disabled: first },
    { label: 'Move down', run: () => onMove(1), disabled: last },
    ...(canDelete ? [{ label: 'Delete', run: onDelete }] : []),
  ]
  const colourItems: Item[] = VOICE_COLORS.map((color) => ({
    label: VOICE_COLOR_NAMES[color] ?? color,
    color,
    checked: color === voice.color,
    run: () => {
      setVoiceColor(voice.id, color)
      onClose(true)
    },
  }))
  const items = colours ? colourItems : actions

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') return
    event.preventDefault()
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    const index = elements.findIndex((element) => element === document.activeElement)
    const item = items[index]
    const next = nextIndex(event.key, index, elements.length)
    if (next !== undefined) elements[next]?.focus()
    else if (event.key === 'Escape') onClose(true)
    else if ((event.key === 'Enter' || event.key === ' ') && item && !item.disabled) item.run()
  }

  return (
    <div
      ref={menu}
      className="voice-menu"
      role="menu"
      aria-label={colours ? `Colour of ${voice.name}` : `Actions for ${voice.name}`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const target = event.relatedTarget
        if (target instanceof Node && !event.currentTarget.contains(target)) onClose(false)
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="voice-menu-item"
          role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={item.checked}
          aria-disabled={item.disabled}
          tabIndex={-1}
          onClick={() => {
            if (!item.disabled) item.run()
          }}
        >
          {item.color !== undefined && (
            <span className="voice-chip" style={{ background: item.color }} aria-hidden="true" />
          )}
          {item.label}
        </button>
      ))}
    </div>
  )
}
