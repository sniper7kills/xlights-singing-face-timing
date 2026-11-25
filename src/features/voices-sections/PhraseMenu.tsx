import { useEffect, useRef, useState } from 'react'
import type { TransferMode } from '../../lib/marks/transferRules.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { ActionMenu } from './ActionMenu.tsx'
import { startTransfer } from './transferCommands.ts'
import { TransferConfirmDialog } from './TransferConfirmDialog.tsx'
import { VoiceTargetList } from './VoiceTargetList.tsx'

const MODE_LABELS: Record<TransferMode, string> = {
  move: 'Move to voice',
  copy: 'Copy to voice',
}

/** Returns the selected marks when each one is a phrase, else an empty list. */
function selectedPhrases(marks: readonly Mark[], ids: readonly string[]): Mark[] {
  const selected = marks.filter((mark) => ids.includes(mark.id))
  return selected.length > 0 && selected.every((mark) => mark.layer === 'phrase') ? selected : []
}

/**
 * Shows the "Phrase" menu button of the editor toolbar, for the selected phrases.
 * The menu has "Move to voice" and "Copy to voice". Each one opens the list of the other voices and "New voice".
 * The button is disabled unless one mark or more is selected and each selected mark is a phrase.
 * The component also shows the confirm dialog of a transfer to a voice with phrases in the range.
 */
export function PhraseMenu() {
  const marks = useSongStore((state) => state.current?.marks)
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TransferMode | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const phrases = selectedPhrases(marks ?? [], selectedMarkIds)
  const source = phrases[0]

  useEffect(() => {
    if (!open) return
    // A press outside the menu closes it. The menu button toggles the menu itself.
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setOpen(false)
        setMode(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(refocus: boolean) {
    setOpen(false)
    setMode(null)
    if (refocus) button.current?.focus()
  }

  function choose(target: string | 'new') {
    if (mode === null) return
    // The confirm dialog gives the focus back to the control that has it when the dialog opens.
    close(true)
    startTransfer(
      phrases.map((phrase) => phrase.id),
      target,
      mode,
    )
  }

  return (
    <div ref={wrapper} className="phrase-menu">
      <button
        ref={button}
        type="button"
        className="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={source === undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        Phrase
      </button>
      {open && source !== undefined && mode === null && (
        <ActionMenu
          label="Phrase"
          items={[
            { label: MODE_LABELS.move, run: () => setMode('move') },
            { label: MODE_LABELS.copy, run: () => setMode('copy') },
          ]}
          onClose={close}
        />
      )}
      {open && source !== undefined && mode !== null && (
        <VoiceTargetList
          label={MODE_LABELS[mode]}
          excludeVoiceId={source.voiceId}
          onChoose={choose}
          onClose={close}
        />
      )}
      <TransferConfirmDialog />
    </div>
  )
}
