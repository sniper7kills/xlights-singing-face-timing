import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

    await user.click(screen.getByRole('button', { name: 'Switch to the light theme' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Switch to the dark theme' })).toBeInTheDocument()
  })

  it('shows the empty song library when the database opens', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a song' })).toBeDisabled()
  })
})
