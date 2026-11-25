import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu.tsx'

function MenuWithButton({ run }: { run: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(true)}>
        Actions
      </button>
      {open && (
        <ActionMenu
          label="Actions for Lead Vocals"
          items={[
            { label: 'Rename', run },
            { label: 'Delete', run },
          ]}
          anchor={anchor}
          onClose={(refocus) => {
            setOpen(false)
            if (refocus) anchor.current?.focus()
          }}
        />
      )}
    </>
  )
}

describe('ActionMenu', () => {
  it('keeps the keys after a pointer press on the padding of the menu, and Escape returns the focus to its button', async () => {
    const user = userEvent.setup()
    render(<MenuWithButton run={vi.fn()} />)
    const menu = screen.getByRole('menu', { name: 'Actions for Lead Vocals' })

    await user.pointer({ keys: '[MouseLeft]', target: menu })
    expect(menu.contains(document.activeElement)).toBe(true)
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus()
  })
})
