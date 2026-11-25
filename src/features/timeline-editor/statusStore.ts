import { create } from 'zustand'

type StatusState = {
  /** The text of the status line, or null for an empty line. */
  text: string | null
  /** Goes up with each report, so the same text again starts a new display time. */
  count: number
}

/** The store of the status line of the editor. It holds one short text: the reason that an action did nothing. */
export const useStatusStore = create<StatusState>()(() => ({ text: null, count: 0 }))

/** Shows the text in the status line of the editor. */
export function reportStatus(text: string): void {
  useStatusStore.setState((state) => ({ text, count: state.count + 1 }))
}

/** Clears the status line. */
export function clearStatus(): void {
  if (useStatusStore.getState().text !== null) useStatusStore.setState({ text: null })
}
