import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../store/types.ts'
import { SongList } from './SongList.tsx'

function song(id: string, name: string, updatedAt: string, durationMs = 161_000): Song {
  return { id, name, durationMs, frameMs: 50, createdAt: updatedAt, updatedAt }
}

const songs = [
  song('a', 'Monster Mash', '2026-10-19T08:00:00.000Z'),
  song('b', 'Jingle Bells', '2026-11-20T08:00:00.000Z', 28_900),
  song('c', 'Carol of the Bells', '2026-11-01T08:00:00.000Z'),
]

function renderList() {
  const onRename = vi.fn<(songId: string, name: string) => Promise<void>>(() => Promise.resolve())
  const onDelete = vi.fn<(songId: string) => Promise<void>>(() => Promise.resolve())
  render(<SongList songs={songs} onRename={onRename} onDelete={onDelete} />)
  return { onRename, onDelete }
}

function links(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('link')
}

describe('SongList', () => {
  it('lists the songs by the date of the last change, newest first', () => {
    renderList()
    expect(
      links().map((link) => within(link).getByText(/./, { selector: 'b' }).textContent),
    ).toEqual(['Jingle Bells', 'Carol of the Bells', 'Monster Mash'])
  })

  it('shows the name, the duration and the change date of a song', () => {
    renderList()
    const link = screen.getByRole('link', { name: /Jingle Bells/ })
    expect(link).toHaveTextContent('Jingle Bells')
    expect(link).toHaveTextContent('0:29')
    expect(link).toHaveTextContent('Changed 2026-11-20')
  })

  it('links each song to its editor route', () => {
    renderList()
    expect(screen.getByRole('link', { name: /Monster Mash/ })).toHaveAttribute('href', '#/song/a')
  })

  it('saves the trimmed new name', async () => {
    const user = userEvent.setup()
    const { onRename } = renderList()

    await user.click(screen.getByRole('button', { name: 'Rename Monster Mash' }))
    const field = screen.getByLabelText('Song name')
    expect(field).toHaveFocus()
    await user.clear(field)
    await user.type(field, '  Monster Mash 2  {Enter}')

    expect(onRename).toHaveBeenCalledWith('a', 'Monster Mash 2')
    expect(await screen.findByRole('button', { name: 'Rename Monster Mash' })).toHaveFocus()
  })

  it('disables Save for a name with only spaces', async () => {
    const user = userEvent.setup()
    renderList()

    await user.click(screen.getByRole('button', { name: 'Rename Monster Mash' }))
    await user.clear(screen.getByLabelText('Song name'))
    await user.type(screen.getByLabelText('Song name'), '   ')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('accepts 80 characters at most in the name field', async () => {
    const user = userEvent.setup()
    renderList()

    await user.click(screen.getByRole('button', { name: 'Rename Monster Mash' }))
    await user.clear(screen.getByLabelText('Song name'))
    await user.type(screen.getByLabelText('Song name'), 'a'.repeat(85))

    expect(screen.getByLabelText('Song name')).toHaveValue('a'.repeat(80))
  })

  it('shows the length hint for an empty name and for a name at the limit only', async () => {
    const user = userEvent.setup()
    renderList()
    const hint = 'A song name has 1 to 80 characters.'

    await user.click(screen.getByRole('button', { name: 'Rename Monster Mash' }))
    expect(screen.queryByText(hint)).toBeNull()

    await user.clear(screen.getByLabelText('Song name'))
    expect(screen.getByText(hint)).toBeInTheDocument()
    expect(screen.getByLabelText('Song name')).toHaveAccessibleDescription(hint)

    await user.type(screen.getByLabelText('Song name'), 'a'.repeat(79))
    expect(screen.queryByText(hint)).toBeNull()

    await user.type(screen.getByLabelText('Song name'), 'a')
    expect(screen.getByText(hint)).toBeInTheDocument()
  })

  it('shows the full song name as a tooltip of the link', () => {
    renderList()

    expect(screen.getByText('Monster Mash')).toHaveAttribute('title', 'Monster Mash')
  })

  it('keeps the name when the person presses Escape in the rename form', async () => {
    const user = userEvent.setup()
    const { onRename } = renderList()

    await user.click(screen.getByRole('button', { name: 'Rename Monster Mash' }))
    await user.type(screen.getByLabelText('Song name'), ' 2{Escape}')

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Rename Monster Mash' })).toHaveFocus()
  })

  it('deletes a song only after the person confirms', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderList()

    await user.click(screen.getByRole('button', { name: 'Delete Monster Mash' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Monster Mash”?' })
    expect(onDelete).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(dialog).toHaveAccessibleDescription(
      'The app deletes its audio file, voices, sections and marks. You cannot undo this.',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledWith('a')
  })

  it('keeps the song when the person cancels the confirm dialog', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderList()

    await user.click(screen.getByRole('button', { name: 'Delete Monster Mash' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete Monster Mash' })).toHaveFocus()
  })
})
