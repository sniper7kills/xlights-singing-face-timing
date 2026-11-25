import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePanelFolds } from '../../store/panelFolds.ts'
import { PanelFold } from './PanelFold.tsx'

function setWindowWidth(widthPx: number) {
  act(() => {
    window.innerWidth = widthPx
    window.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  localStorage.clear()
  usePanelFolds.getState().reload()
  window.innerWidth = 1024
})

describe('PanelFold', () => {
  it('starts folded at 1024 px and opens at 1280 px when the person made no choice', () => {
    render(<PanelFold panel="voices" />)
    const button = screen.getByRole('button', { name: 'Voices' })

    expect(button).toHaveAttribute('aria-expanded', 'false')
    setWindowWidth(1280)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps a panel that the person opened open at 1024 px', async () => {
    render(<PanelFold panel="inspector" />)
    const button = screen.getByRole('button', { name: 'Inspector' })

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('title', 'Hide the inspector panel')
    expect(usePanelFolds.getState().choices).toEqual({ inspector: 'open' })
  })
})
