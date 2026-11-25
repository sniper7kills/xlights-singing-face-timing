import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLD_BELOW_PX, isFolded, usePanelFolds } from './panelFolds.ts'

beforeEach(() => {
  localStorage.clear()
  usePanelFolds.getState().reload()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isFolded', () => {
  it('folds a panel with no choice below 1280 px and opens it at 1280 px', () => {
    expect(isFolded(undefined, 1024)).toBe(true)
    expect(isFolded(undefined, FOLD_BELOW_PX)).toBe(false)
  })

  it('follows the choice of the person at each width', () => {
    expect(isFolded('open', 1024)).toBe(false)
    expect(isFolded('folded', 1920)).toBe(true)
  })
})

describe('usePanelFolds', () => {
  it('keeps the choice in localStorage for the next page', () => {
    usePanelFolds.getState().setFolded('voices', false)
    usePanelFolds.getState().setFolded('inspector', true)

    usePanelFolds.setState({ choices: {} })
    usePanelFolds.getState().reload()

    expect(usePanelFolds.getState().choices).toEqual({ voices: 'open', inspector: 'folded' })
  })

  it('ignores a stored value that is not valid', () => {
    localStorage.setItem('sft.panels', JSON.stringify({ voices: 'wide', inspector: 'open' }))
    usePanelFolds.getState().reload()

    expect(usePanelFolds.getState().choices).toEqual({ inspector: 'open' })
  })

  it('reads no choice from text that is not JSON or not an object', () => {
    localStorage.setItem('sft.panels', '{')
    usePanelFolds.getState().reload()
    expect(usePanelFolds.getState().choices).toEqual({})

    localStorage.setItem('sft.panels', '3')
    usePanelFolds.getState().reload()
    expect(usePanelFolds.getState().choices).toEqual({})
  })

  it('keeps the choice for the page when localStorage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    usePanelFolds.getState().setFolded('voices', true)

    expect(usePanelFolds.getState().choices).toEqual({ voices: 'folded' })
  })
})
