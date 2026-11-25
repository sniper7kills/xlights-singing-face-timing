import { type KeyboardEvent, useEffect, useRef } from 'react'

/** One item of an `ActionMenu`. */
export type ActionMenuItem = {
  label: string
  run: () => void
  disabled?: boolean
  /** The tooltip and the accessible description, for example the reason of a disabled item. */
  note?: string
}

type ActionMenuProps = {
  /** The accessible name of the menu. */
  label: string
  items: readonly ActionMenuItem[]
  /**
   * Receives `Escape`, or a focus that leaves the menu.
   * `refocus` is false when the focus goes to another control, so the menu button must not take it back.
   */
  onClose: (refocus: boolean) => void
}

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
 * Shows a menu of actions, with the focus on the first item.
 * The arrow keys, `Home` and `End` move the focus. `Enter` or `Space` runs the item. `Escape` closes the menu.
 * The menu takes each key except `Tab`, so the editor shortcuts do not act while it is open.
 */
export function ActionMenu({ label, items, onClose }: ActionMenuProps) {
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [label])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') return
    event.preventDefault()
    const elements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    )
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
      className="action-menu"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const target = event.relatedTarget
        if (target instanceof Node && !event.currentTarget.contains(target)) onClose(false)
      }}
    >
      {items.map((item, index) => (
        <button
          // A voice can have the name of another item, so the label alone is not a unique key.
          key={`${index}-${item.label}`}
          type="button"
          className="action-menu-item"
          role="menuitem"
          aria-disabled={item.disabled}
          // The text names the item, so the browser gives the title as its accessible description.
          title={item.note}
          tabIndex={-1}
          onClick={() => {
            if (!item.disabled) item.run()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
