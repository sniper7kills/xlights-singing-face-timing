import { vi } from 'vitest'

export type StorageStub = {
  persist: ReturnType<typeof vi.fn<() => Promise<boolean>>>
  persisted: ReturnType<typeof vi.fn<() => Promise<boolean>>>
  estimate: ReturnType<typeof vi.fn<() => Promise<StorageEstimate>>>
}

/**
 * Installs a stub of navigator.storage and returns its functions, because jsdom has no Storage API.
 * Call removeStorageStub after the test.
 */
export function stubStorage(options: { granted?: boolean; usage?: number; quota?: number } = {}) {
  const { granted = false, usage = 0, quota = 512 * 1024 * 1024 } = options
  const stub: StorageStub = {
    persist: vi.fn(() => Promise.resolve(granted)),
    persisted: vi.fn(() => Promise.resolve(granted)),
    estimate: vi.fn(() => Promise.resolve({ usage, quota })),
  }
  Object.defineProperty(navigator, 'storage', { configurable: true, value: stub })
  return stub
}

/** Removes the stub of navigator.storage, so the next test has no Storage API again. */
export function removeStorageStub() {
  Reflect.deleteProperty(navigator, 'storage')
}
