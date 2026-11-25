import { create } from 'zustand'

/** A side panel of the editor that the person can fold. */
export type SidePanel = 'voices' | 'inspector'

/** The choice of the person for one side panel. Undefined means no choice, so the window width decides. */
export type FoldChoice = 'open' | 'folded' | undefined

/** Below this window width, a side panel with no choice of the person starts folded, so the stage gets the width. */
export const FOLD_BELOW_PX = 1280

const STORAGE_KEY = 'sft.panels'

type Choices = Partial<Record<SidePanel, 'open' | 'folded'>>

function isChoice(value: unknown): value is 'open' | 'folded' {
  return value === 'open' || value === 'folded'
}

/** Returns the choices that `localStorage` keeps. An item that is not valid counts as no choice. */
function readChoices(): Choices {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return {}
    const { voices, inspector } = value as Record<string, unknown>
    return {
      ...(isChoice(voices) && { voices }),
      ...(isChoice(inspector) && { inspector }),
    }
  } catch {
    // A private window can refuse `localStorage`, and the panels then follow the window width.
    return {}
  }
}

function writeChoices(choices: Choices): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices))
  } catch {
    // A refused write keeps the choice for this page only.
  }
}

/**
 * Returns true when the side panel is folded.
 * @param choice The choice of the person, or undefined.
 * @param windowWidthPx The width of the window in pixels.
 */
export function isFolded(choice: FoldChoice, windowWidthPx: number): boolean {
  return choice === undefined ? windowWidthPx < FOLD_BELOW_PX : choice === 'folded'
}

type PanelFoldState = {
  choices: Choices
  /** Keeps the choice of the person for the panel, also in `localStorage` for each browser. A fold is not an undo step. */
  setFolded: (panel: SidePanel, folded: boolean) => void
  /** Reads the choices from `localStorage` again. The editor calls it when it opens. */
  reload: () => void
}

/** The store of the fold state of the voice rail and the inspector. It is view state, so it is not part of the song. */
export const usePanelFolds = create<PanelFoldState>()((set, get) => ({
  choices: readChoices(),
  setFolded: (panel, folded) => {
    const choices = { ...get().choices, [panel]: folded ? 'folded' : 'open' } satisfies Choices
    writeChoices(choices)
    set({ choices })
  },
  reload: () => set({ choices: readChoices() }),
}))
