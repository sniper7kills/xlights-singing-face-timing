import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDatabaseStatus } from './database.ts'
import { SongLibraryPage } from './SongLibraryPage.tsx'

const NEWER_MESSAGE =
  'This browser holds data from a newer version of the app. Reload the page. If the message stays, close the other tabs of the app and reload.'
const BLOCKED_MESSAGE = 'Close the other tabs of the app. Then reload this page.'

/** Shows the song library with the status of the database, as the app does. */
function Library() {
  return <SongLibraryPage databaseStatus={useDatabaseStatus()} />
}

/** Opens the app database at a version with no object store, as another version of the app does. */
function openAtVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('singing-face-timing', version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('the song library and the database open', () => {
  it('shows the newer version message when a newer version of the app wrote the database', async () => {
    ;(await openAtVersion(4)).close()

    render(<Library />)

    expect(await screen.findByRole('alert')).toHaveTextContent(NEWER_MESSAGE)
  })

  it('shows the close the other tabs message while an old tab holds the database open', async () => {
    const other = await openAtVersion(2)

    render(<Library />)

    expect(await screen.findByRole('alert')).toHaveTextContent(BLOCKED_MESSAGE)
    other.close()
    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
  })

  it('shows the message of a browser that cannot store songs for each other failure', () => {
    render(<SongLibraryPage databaseStatus="unavailable" />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This browser cannot store songs. Use a current Chrome, Edge or Firefox.',
    )
  })
})
