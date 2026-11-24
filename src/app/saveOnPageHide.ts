import { flushAutosave } from '../store/autosave.ts'

/**
 * Saves a pending change of the open song when the page becomes hidden or unloads.
 * Returns a function that removes the listeners.
 */
export function startSaveOnPageHide(): () => void {
  // The browser can discard a hidden page with no later event, so the autosave delay is too long.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void flushAutosave()
  }
  const onPageHide = () => void flushAutosave()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
  }
}
