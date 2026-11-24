import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StorageMeter } from './StorageMeter.tsx'

const MB = 1024 * 1024
const NOTE = 'The browser can remove songs when disk space is low. Export your work.'

describe('StorageMeter', () => {
  it('shows the used and the allowed space in MB', () => {
    render(
      <StorageMeter
        storage={{ usedBytes: 118 * MB, quotaBytes: 512 * MB, persisted: true }}
        showPersistenceNote
      />,
    )
    expect(screen.getByText('118 MB used of 512 MB allowed')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Storage used' })).toHaveAttribute(
      'value',
      String(118 * MB),
    )
  })

  it('shows the note when the browser refuses persistent storage', () => {
    render(
      <StorageMeter
        storage={{ usedBytes: 0, quotaBytes: MB, persisted: false }}
        showPersistenceNote
      />,
    )
    expect(screen.getByRole('note')).toHaveTextContent(NOTE)
  })

  it('hides the note when the storage is persistent', () => {
    render(
      <StorageMeter
        storage={{ usedBytes: 0, quotaBytes: MB, persisted: true }}
        showPersistenceNote
      />,
    )
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('hides the note when the page asks for no note', () => {
    render(
      <StorageMeter
        storage={{ usedBytes: 0, quotaBytes: MB, persisted: false }}
        showPersistenceNote={false}
      />,
    )
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
