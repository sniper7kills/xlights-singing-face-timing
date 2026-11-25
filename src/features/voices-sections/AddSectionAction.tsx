import { type KeyboardEvent, useRef, useState } from 'react'
import { blockText } from '../../lib/marks/editBlocks.ts'
import {
  MAX_SECTION_NAME,
  nextSectionName,
  sectionTrimNote,
} from '../../lib/sections/sectionRules.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { addSection } from '../../store/actions/sections.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { reportStatus } from '../timeline-editor/statusStore.ts'
import { ReasonButton } from '../timeline-editor/ReasonButton.tsx'

const NO_ROOM_MESSAGE = 'No room for a section here. Select a free range of 1 second or more.'

/**
 * Adds a section for `range` as one undo step, and returns the note under the button.
 * When the app makes the section shorter than the range, the status line names the section in the way.
 */
function add(name: string, range: TimeRange): string | null {
  const content = useSongStore.getState().current
  if (!content) return null
  const added = addSection(content.song.id, name, range.startMs, range.endMs)
  if (added === null) return NO_ROOM_MESSAGE
  const note = sectionTrimNote(content.sections, range, added, content.song.frameMs)
  if (note !== null) reportStatus(note)
  return null
}

/**
 * Shows the "Add section" button of the editor toolbar. With no time selection it does not act, and its tooltip states the cause.
 * A click opens the field "Section name" with the default "Section N", for the time selection at the click.
 * `Enter` or a lost focus adds the section as one undo step. `Escape` closes the field and adds nothing.
 * A lost focus with a name of only spaces adds nothing.
 * With no free range of 1 second or more, the action shows a message and adds nothing.
 */
export function AddSectionAction() {
  const selection = useViewStore((view) => view.selection)
  // The range of the open field. A click on the stage can change the time selection before the field closes.
  const [range, setRange] = useState<TimeRange | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  // A save or a cancel removes the field, and the removal can blur it, so the field reports one result only.
  const finished = useRef(false)

  /** Closes the field. With a name, it adds the section. */
  function finish(name: string | null, refocus: boolean) {
    if (finished.current || range === null) return
    finished.current = true
    setRange(null)
    if (refocus) button.current?.focus()
    if (name !== null && name.trim() !== '') setMessage(add(name, range))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(null, true)
    } else if (event.key === 'Enter' && event.currentTarget.value.trim() !== '') {
      event.preventDefault()
      finish(event.currentTarget.value, true)
    }
  }

  return (
    <div className="add-section">
      <ReasonButton
        ref={button}
        reason={selection === null ? blockText('select-range') : null}
        hint="Add a section for the time selection"
        onAct={() => {
          if (selection === null) return
          finished.current = false
          setMessage(null)
          setRange(selection)
        }}
      >
        Add section
      </ReasonButton>
      {range !== null && (
        <input
          className="label-editor"
          aria-label="Section name"
          maxLength={MAX_SECTION_NAME}
          defaultValue={nextSectionName(useSongStore.getState().current?.sections ?? [])}
          // The field opens from a click on "Add section", so the person types at once.
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={onKeyDown}
          onBlur={(event) => finish(event.currentTarget.value, false)}
        />
      )}
      {message !== null && (
        <p className="message add-section-message" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
