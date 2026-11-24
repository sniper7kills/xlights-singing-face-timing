import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'

describe('App', () => {
  it('shows the app name in the header', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Singing Face Timing')
  })

  it('switches the theme on the html element when the person uses the theme switch', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    await user.click(screen.getByRole('button', { name: 'Theme: switch to light' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Theme: switch to dark' })).toBeInTheDocument()
  })

  it('shows the empty song library when the database opens', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a song' })).toBeDisabled()
  })

  it('shows the storage message when the browser has no IndexedDB', async () => {
    // The setup file also stubs matchMedia, so this test puts back only its own global.
    const original = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    try {
      render(<App />)
      await screen.findByRole('alert')
      expect(screen.getByRole('main')).toHaveTextContent(
        /^This browser cannot store songs\. Use a current Chrome, Edge or Firefox\.$/,
      )
    } finally {
      vi.stubGlobal('indexedDB', original)
    }
  })
})
