import { useRef, useState } from 'react'
import { phrasesOfSection } from '../../lib/sections/sectionRules.ts'
import { deleteSection, phrasesInSection } from '../../store/actions/sections.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Section } from '../../store/types.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { ActionMenu } from './ActionMenu.tsx'
import { startTransfer } from './transferCommands.ts'
import { VoiceTargetList } from './VoiceTargetList.tsx'

const MOVE_LABEL = 'Move section to voice'

type SectionMenuProps = {
  section: Section
  /** Opens the name field of the section. */
  onRename: () => void
}

/**
 * Shows the menu button "Actions for <section name>" and its menu: "Rename", "Move section to voice" and "Delete".
 * "Move section to voice" moves the phrases of the shown voice in the section, with the rules of `startTransfer`.
 * It is disabled when the shown voice has no phrase in the section.
 * "Delete" has no confirm dialog, because the marks stay and one undo restores the section.
 */
export function SectionMenu({ section, onRename }: SectionMenuProps) {
  const voices = useSongStore((state) => state.current?.voices)
  const marks = useSongStore((state) => state.current?.marks)
  const voiceId = selectedVoice(
    voices ?? [],
    useViewStore((view) => view.selectedVoiceId),
  )?.id
  const [open, setOpen] = useState<'actions' | 'targets' | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const label = `Actions for ${section.name}`
  const hasPhrases =
    phrasesOfSection(
      section,
      (marks ?? []).filter((mark) => mark.voiceId === voiceId),
    ).length > 0

  function close(refocus: boolean) {
    setOpen(null)
    if (refocus) button.current?.focus()
  }

  return (
    <div ref={wrapper} className="section-menu">
      <button
        ref={button}
        type="button"
        className="section-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={() => (open === null ? setOpen('actions') : close(false))}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open === 'actions' && (
        <ActionMenu
          label={label}
          items={[
            {
              label: 'Rename',
              run: () => {
                setOpen(null)
                onRename()
              },
            },
            {
              label: MOVE_LABEL,
              run: () => setOpen('targets'),
              disabled: !hasPhrases,
            },
            {
              label: 'Delete',
              run: () => {
                // The block goes with the section, so the band takes the focus that the block had.
                wrapper.current?.closest<HTMLElement>('.section-band')?.focus()
                deleteSection(section.id)
              },
            },
          ]}
          anchor={button}
          onClose={close}
        />
      )}
      {open === 'targets' && voiceId !== undefined && (
        <VoiceTargetList
          label={MOVE_LABEL}
          excludeVoiceId={voiceId}
          anchor={button}
          onChoose={(target) => {
            close(true)
            const ids = phrasesInSection(voiceId, section.id).map((phrase) => phrase.id)
            startTransfer(ids, target, 'move')
          }}
          onClose={close}
        />
      )}
    </div>
  )
}
