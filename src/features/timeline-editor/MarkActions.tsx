import type { MouseEvent } from 'react'
import {
  blockText,
  deleteBlock,
  type EditBlock,
  labelBlock,
  mergeBlock,
  splitBlock,
} from '../../lib/marks/editBlocks.ts'
import { mergeWithNext } from '../../store/actions/mergeWithNext.ts'
import { splitMark } from '../../store/actions/splitMark.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { deleteSelectedMarks, editLabel } from './markCommands.ts'
import { ReasonButton } from './ReasonButton.tsx'

const NO_MARKS: readonly Mark[] = []

function text(block: EditBlock | null): string | null {
  return block === null ? null : blockText(block)
}

/** Returns the only selected id. The buttons act only when their cause is null, so the id then exists. */
function onlyId(): string {
  return useViewStore.getState().selectedMarkIds[0] ?? ''
}

// A press on a button must not take the focus from the mark, so the shortcuts keep acting on the mark.
function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

/**
 * Shows the group "Mark" of the toolbar: "Split", "Merge with next", "Delete" and "Edit label".
 * Each button runs the same store action as its shortcut. When the action cannot act, the button
 * stays in the tab order and its tooltip states the cause (see `editBlocks`).
 */
export function MarkActions() {
  const marks = useSongStore((state) => state.current?.marks ?? NO_MARKS)
  const frameMs = useSongStore((state) => state.current?.song.frameMs ?? 0)
  const ids = useViewStore((view) => view.selectedMarkIds)
  // The play time changes on each animation frame, so the selector returns the cause only.
  const split = useViewStore((view) =>
    splitBlock(marks, view.selectedMarkIds, view.playTimeMs, frameMs),
  )
  return (
    <div className="mark-actions" role="group" aria-label="Mark">
      <ReasonButton
        reason={text(split)}
        hint="Split the selected mark at the play cursor"
        shortcut="S"
        aria-keyshortcuts="S"
        onMouseDown={keepFocus}
        onAct={() => splitMark(onlyId(), useViewStore.getState().playTimeMs)}
      >
        Split
      </ReasonButton>
      <ReasonButton
        reason={text(mergeBlock(marks, ids))}
        hint="Merge the selected mark with the next mark"
        shortcut="M"
        aria-keyshortcuts="M"
        onMouseDown={keepFocus}
        onAct={() => mergeWithNext(onlyId())}
      >
        Merge with next
      </ReasonButton>
      <ReasonButton
        reason={text(deleteBlock(marks, ids))}
        hint="Delete the selected marks"
        shortcut="Delete"
        aria-keyshortcuts="Delete"
        onMouseDown={keepFocus}
        onAct={deleteSelectedMarks}
      >
        Delete
      </ReasonButton>
      <ReasonButton
        reason={text(labelBlock(marks, ids))}
        hint="Edit the label"
        shortcut="Enter or F2"
        aria-keyshortcuts="Enter F2"
        onMouseDown={keepFocus}
        onAct={() => editLabel(onlyId())}
      >
        Edit label
      </ReasonButton>
    </div>
  )
}
