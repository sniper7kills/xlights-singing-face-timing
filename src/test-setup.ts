import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no matchMedia, and the theme reads the colour scheme of the system through it.
vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
  const list = new EventTarget() as MediaQueryList
  return Object.assign(list, {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  })
})

afterEach(() => {
  cleanup()
})
