import { create } from 'zustand'
import type { MarkEdit } from '../../lib/marks/markEdit.ts'
import type { Layer, Mark } from '../../store/types.ts'
import { clearStatus } from './statusStore.ts'

/** The mark whose label the person changes, or the empty range where the person adds a mark. */
export type LabelTarget =
  | { kind: 'edit'; id: string }
  | { kind: 'add'; voiceId: string; layer: Layer; startMs: number; endMs: number }

/** The label control that is open: the text field of a phrase or a word, or the phoneme label list. */
export type OpenLabel = { control: 'text' | 'menu'; target: LabelTarget }

/** A phrase label that waits for the confirm dialog, because it changes the words of the phrase. */
export type PendingLabel = { id: string; label: string }

type MarkUiState = {
  /**
   * The state of each mark that a drag changes, before the release. Null hides a mark that the drag removes.
   * Each mark reads only its own entry, so a pointer move draws only the marks that change.
   */
  preview: ReadonlyMap<string, Mark | null>
  open: OpenLabel | null
  pending: PendingLabel | null
  /**
   * The mark that takes the focus when it is drawn. A key can select a mark that is not drawn yet.
   * A value from `layerFocusId` gives the focus to the track of a layer.
   */
  focusId: string | null
  /** True from the press on a mark to the end of its drag or click. The edit shortcuts do not act during a drag. */
  dragging: boolean
  showPreview: (edit: MarkEdit | null) => void
  openLabel: (open: OpenLabel | null) => void
  setPending: (pending: PendingLabel | null) => void
  requestFocus: (id: string | null) => void
  setDragging: (dragging: boolean) => void
}

/**
 * Returns the focus id of the track of one layer of one voice, for `requestFocus`.
 * A cancelled add gives the focus back to the track, because no mark exists to take it.
 */
export function layerFocusId(voiceId: string, layer: Layer): string {
  return `layer:${voiceId}:${layer}`
}

const NO_PREVIEW: ReadonlyMap<string, Mark | null> = new Map()

/**
 * The store of the mark controls on the layers: the drag preview, the open label control and the confirm dialog.
 * It is separate from the view store, so a pointer move does not wake the subscribers of the view.
 */
export const useMarkUiStore = create<MarkUiState>()((set) => ({
  preview: NO_PREVIEW,
  open: null,
  pending: null,
  focusId: null,
  dragging: false,
  showPreview: (edit) =>
    set({
      preview:
        edit === null
          ? NO_PREVIEW
          : new Map<string, Mark | null>([
              ...edit.changed.map((mark): [string, Mark] => [mark.id, mark]),
              ...edit.removedIds.map((id): [string, null] => [id, null]),
            ]),
    }),
  openLabel: (open) => set({ open }),
  setPending: (pending) => set({ pending }),
  requestFocus: (focusId) => set({ focusId }),
  setDragging: (dragging) => set({ dragging }),
}))

/** Closes each control, clears the preview and the status line. The editor calls it when it opens a song. */
export function resetMarkUi(): void {
  clearStatus()
  useMarkUiStore.setState({
    preview: NO_PREVIEW,
    open: null,
    pending: null,
    focusId: null,
    dragging: false,
  })
}
