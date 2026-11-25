import { type KeyboardEvent, useRef, useState } from 'react'
import { blockText } from '../../lib/marks/editBlocks.ts'
import { MAX_SECTION_NAME, nextSectionName } from '../../lib/sections/sectionRules.ts'
import { addSection } from '../../store/actions/sections.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { ReasonButton } from '../timeline-editor/ReasonButton.tsx'

const NO_ROOM_MESSAGE = 'No room for a section here. Select a free range of 1 second or more.'

/**
 * Shows the "Add section" button of the editor toolbar. With no time selection it does not act, and its tooltip states the cause.
 * A click opens the field "Section name" with the default "Section N". `Enter` adds the section from the time
 * selection as one undo step, and `Escape` or a lost focus closes the field.
 * With no free range of 1 second or more, the action shows a message and adds nothing.
 */
export function AddSectionAction() {
  const selection = useViewStore((view) => view.selection)
  const [naming, setNaming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  function close(refocus: boolean) {
    setNaming(false)
    if (refocus) button.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    const name = event.currentTarget.value
    const content = useSongStore.getState().current
    if (event.key !== 'Enter' || name.trim() === '') return
    event.preventDefault()
    close(true)
    // A click on the stage can clear the time selection while the field is open. Then the field adds nothing.
    if (!content || !selection) return
    const added = addSection(content.song.id, name, selection.startMs, selection.endMs)
    setMessage(added === null ? NO_ROOM_MESSAGE : null)
  }

  return (
    <div className="add-section">
      <ReasonButton
        ref={button}
        reason={selection === null ? blockText('select-range') : null}
        hint="Add a section for the time selection"
        onAct={() => {
          setMessage(null)
          setNaming(true)
        }}
      >
        Add section
      </ReasonButton>
      {naming && (
        <input
          className="label-editor"
          aria-label="Section name"
          maxLength={MAX_SECTION_NAME}
          defaultValue={nextSectionName(useSongStore.getState().current?.sections ?? [])}
          // The field opens from a click on "Add section", so the person types at once.
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={onKeyDown}
          onBlur={() => close(false)}
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
