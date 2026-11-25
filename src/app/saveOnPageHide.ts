import { flushAutosave, type SaveState, useAutosaveStore } from '../store/autosave.ts'

/** Asks the browser to confirm the leave (MDN: preventDefault, and returnValue for old browsers). */
function confirmLeave(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = true
}

/**
 * Saves a pending change of the open song when the page becomes hidden or unloads, and
 * asks the browser to confirm a leave while a change is not saved (FR-audio-24, 25).
 * Returns a function that removes the listeners.
 */
export function startSaveOnPageHide(): () => void {
  // The browser can discard a hidden page with no later event, so the autosave delay is too long.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void flushAutosave()
  }
  const onPageHide = () => void flushAutosave()
  // A beforeunload listener can keep the page out of the back/forward cache, so it exists only while a change is not saved.
  const watchSaveState = (saveState: SaveState) => {
    if (saveState === 'saving') window.addEventListener('beforeunload', confirmLeave)
    else window.removeEventListener('beforeunload', confirmLeave)
  }
  watchSaveState(useAutosaveStore.getState().saveState)
  const stopWatch = useAutosaveStore.subscribe((state, previous) => {
    if (state.saveState !== previous.saveState) watchSaveState(state.saveState)
  })
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    stopWatch()
    window.removeEventListener('beforeunload', confirmLeave)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
  }
}
