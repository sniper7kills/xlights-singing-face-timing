import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, vi } from 'vitest'
import { closeDatabase } from './store/db.ts'

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

// jsdom has no layout and no ResizeObserver. A test sets the width through clientWidth.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// jsdom has no pointer capture, and the mark drag captures the pointer on the mark.
HTMLElement.prototype.setPointerCapture = () => undefined
HTMLElement.prototype.releasePointerCapture = () => undefined
HTMLElement.prototype.hasPointerCapture = () => false

afterEach(async () => {
  cleanup()
  // Each test starts with no open connection and an empty database.
  await closeDatabase()
  vi.stubGlobal('indexedDB', new IDBFactory())
})
