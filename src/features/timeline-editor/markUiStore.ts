import { create } from 'zustand'
import type { MarkEdit } from '../../lib/marks/markEdit.ts'
import type { Layer, Mark } from '../../store/types.ts'

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
  /** The mark that takes the focus when it is drawn. A key can select a mark that is not drawn yet. */
  focusId: string | null
  showPreview: (edit: MarkEdit | null) => void
  openLabel: (open: OpenLabel | null) => void
  setPending: (pending: PendingLabel | null) => void
  requestFocus: (id: string | null) => void
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
}))

/** Closes each control and clears the preview. The editor calls it when it opens a song. */
export function resetMarkUi(): void {
  useMarkUiStore.setState({ preview: NO_PREVIEW, open: null, pending: null, focusId: null })
}
