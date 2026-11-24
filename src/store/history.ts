/** The number of steps that the history stack keeps. */
export const HISTORY_DEPTH = 100

/**
 * The undo history of one value. `past` holds the earlier values, the newest last.
 * `future` holds the values that redo restores, the next one last.
 * A history is immutable: each function returns a new history.
 */
export type History<T> = {
  past: T[]
  future: T[]
}

/** Returns a history with no steps. */
export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/**
 * Returns the history after one new step. `present` is the value before the step.
 * The new step clears the redo steps. The oldest step goes when the stack holds more
 * than HISTORY_DEPTH steps.
 */
export function recordStep<T>(history: History<T>, present: T): History<T> {
  return { past: [...history.past, present].slice(-HISTORY_DEPTH), future: [] }
}

/**
 * Returns the value before the last step and the history after the undo.
 * Returns undefined if the history has no step to undo.
 */
export function undoStep<T>(
  history: History<T>,
  present: T,
): { history: History<T>; present: T } | undefined {
  const previous = history.past.at(-1)
  if (previous === undefined) return undefined
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, present] },
    present: previous,
  }
}

/**
 * Returns the value that the last undo removed and the history after the redo.
 * Returns undefined if the history has no step to redo.
 */
export function redoStep<T>(
  history: History<T>,
  present: T,
): { history: History<T>; present: T } | undefined {
  const next = history.future.at(-1)
  if (next === undefined) return undefined
  return {
    history: { past: [...history.past, present], future: history.future.slice(0, -1) },
    present: next,
  }
}
