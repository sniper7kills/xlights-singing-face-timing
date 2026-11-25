import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { voiceNameError } from '../../lib/voices/voiceRules.ts'
import { importNameHint } from '../../lib/xtiming/names.ts'
import { setVoicePreviewMuted } from '../../store/actions/setPreviewMuted.ts'
import { renameVoice } from '../../store/actions/voices.ts'
import type { Voice } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { plural } from '../xtiming-export/plural.ts'
import { VoiceMenu } from './VoiceMenu.tsx'

type VoiceRowProps = {
  voice: Voice
  /** The voices of the song in row order. The rename field reads them for the duplicate name rule. */
  voices: readonly Voice[]
  phraseCount: number
  /** True when the layers show this voice. */
  selected: boolean
  /** Receives -1 for "Move up" and 1 for "Move down". */
  onMove: (direction: -1 | 1) => void
  /** Receives "Delete" from the menu. The rail shows the confirm dialog. */
  onDelete: () => void
}

type Focus = 'select' | 'menu' | null

/**
 * Shows one row of the voice rail: a select button with the colour chip, the name and the phrase count,
 * then the mute button of the face preview and the menu button.
 * "Rename" shows a text field in place of the select button. `Enter` and a lost focus save, and `Escape` cancels.
 * A name with a field error keeps the field open with the error.
 */
export function VoiceRow({
  voice,
  voices,
  phraseCount,
  selected,
  onMove,
  onDelete,
}: VoiceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The hint shows how xLights changes the name. It is not an error, so the name still saves.
  const [hint, setHint] = useState<string | null>(null)
  // A control that the next render removes cannot keep the focus, so the row moves the focus after the render.
  const [focus, setFocus] = useState<Focus>(null)
  const row = useRef<HTMLLIElement>(null)
  const selectButton = useRef<HTMLButtonElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const errorId = useId()
  const hintId = useId()
  const nameId = useId()
  const countId = useId()
  // A save or a cancel removes the field, and the removal can blur it, so the field reports one result only.
  const finished = useRef(false)
  const index = voices.findIndex((item) => item.id === voice.id)
  const muted = voice.previewMuted === true

  useEffect(() => {
    if (focus === null) return
    ;(focus === 'select' ? selectButton : menuButton).current?.focus()
    setFocus(null)
  }, [focus])

  useEffect(() => {
    if (!menuOpen) return
    // A press outside the row closes the menu. The menu button toggles the menu itself.
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !row.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  function closeMenu(refocus: boolean) {
    setMenuOpen(false)
    if (refocus) setFocus('menu')
  }

  function save(text: string): boolean {
    if (finished.current) return false
    const message = voiceNameError(voices, voice.id, text)
    setError(message)
    if (message !== null) return false
    finished.current = true
    renameVoice(voice.id, text)
    setRenaming(false)
    setHint(null)
    return true
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (save(event.currentTarget.value)) setFocus('select')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finished.current = true
      setRenaming(false)
      setError(null)
      setHint(null)
      setFocus('select')
    }
  }

  return (
    <li ref={row} className="voice-row">
      {renaming ? (
        <div className="voice-rename">
          <input
            className="voice-name-field"
            aria-label="Voice name"
            defaultValue={voice.name}
            aria-invalid={error !== null}
            aria-describedby={
              [error === null ? '' : errorId, hint === null ? '' : hintId].join(' ').trim() ||
              undefined
            }
            // The field opens from the menu, so the person types at once.
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={onNameKeyDown}
            onChange={(event) => setHint(importNameHint(event.currentTarget.value))}
            onBlur={(event) => save(event.currentTarget.value)}
          />
          {error !== null && (
            <p id={errorId} className="field-error" role="alert">
              {error}
            </p>
          )}
          {hint !== null && (
            <p id={hintId} className="field-hint" role="status">
              {hint}
            </p>
          )}
        </div>
      ) : (
        <button
          ref={selectButton}
          type="button"
          className="voice-select"
          aria-pressed={selected}
          aria-labelledby={nameId}
          aria-describedby={countId}
          onClick={() => {
            if (!selected) useViewStore.getState().selectVoice(voice.id)
          }}
        >
          <span className="voice-chip" style={{ background: voice.color }} aria-hidden="true" />
          <span className="voice-text">
            <span id={nameId} className="voice-name" title={voice.name}>
              {voice.name}
            </span>
            <small id={countId} className="voice-count">
              {plural(phraseCount, 'phrase')}
            </small>
          </span>
        </button>
      )}
      {/* The glyph changes with the state, so the button does not show the state by colour alone. */}
      <button
        type="button"
        className="voice-mute-button"
        aria-label={`Mute face preview of ${voice.name}`}
        title={`Mute face preview of ${voice.name}`}
        aria-pressed={muted}
        onClick={() => setVoicePreviewMuted(voice.id, !muted)}
      >
        <span aria-hidden="true">{muted ? '⊘' : '☺'}</span>
      </button>
      <button
        ref={menuButton}
        type="button"
        className="voice-menu-button"
        aria-label={`Actions for ${voice.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {menuOpen && (
        <VoiceMenu
          voice={voice}
          first={index === 0}
          last={index === voices.length - 1}
          canDelete={voices.length > 1}
          onRename={() => {
            setMenuOpen(false)
            finished.current = false
            setRenaming(true)
            setHint(importNameHint(voice.name))
          }}
          onMove={(direction) => {
            onMove(direction)
            closeMenu(true)
          }}
          onDelete={() => {
            // The dialog gives the focus back to the control that has it when the dialog opens.
            menuButton.current?.focus()
            setMenuOpen(false)
            onDelete()
          }}
          onClose={closeMenu}
        />
      )}
    </li>
  )
}
