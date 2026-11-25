import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from 'react'
import { previewSectionEdge, type SectionEdge } from '../../lib/sections/sectionRules.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import { importNameHint } from '../../lib/xtiming/names.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { stepSectionEdge, updateSection } from '../../store/actions/sections.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Section } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { LabelEditor } from '../timeline-editor/LabelEditor.tsx'
import { rangeToPx, type TimeScale, timeAtPx } from '../timeline-editor/timeScale.ts'
import { SectionMenu } from './SectionMenu.tsx'

type SectionBlockProps = {
  section: Section
  scale: TimeScale
  /** The duration of the open song in milliseconds. */
  durationMs: number
}

type EdgeHandleProps = SectionBlockProps & {
  edge: SectionEdge
  /** Receives the range during a drag, and null at the release. */
  onPreview: (range: TimeRange | null) => void
}

const EDGE_NAMES: Record<SectionEdge, string> = { start: 'Start of', end: 'End of' }

const ARROW_DIRECTIONS: Partial<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1 }

/**
 * Shows the handle of one edge of a section. A drag shows the new range and changes the section once at the release,
 * so a drag is one undo step. `ArrowLeft` and `ArrowRight` move the edge by one frame size.
 */
function EdgeHandle({ section, scale, durationMs, edge, onPreview }: EdgeHandleProps) {
  const preview = useRef<TimeRange | null>(null)
  const dragging = useRef(false)

  function show(range: TimeRange | null) {
    preview.current = range
    onPreview(range)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const content = useSongStore.getState().current
    const band = event.currentTarget.closest('.section-band')
    if (!dragging.current || !content || !band) return
    const toMs = timeAtPx(scale, event.clientX - band.getBoundingClientRect().left, durationMs)
    const { sections, song } = content
    show(previewSectionEdge(sections, section.id, edge, toMs, song.frameMs, durationMs))
  }

  function onPointerUp() {
    const range = preview.current
    dragging.current = false
    show(null)
    if (range === null) return
    updateSection(
      section.id,
      edge === 'start' ? { startMs: range.startMs } : { endMs: range.endMs },
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = ARROW_DIRECTIONS[event.key]
    if (direction === undefined) return
    // The editor shortcuts ignore a key with its default prevented, so the arrow does not also move a mark.
    event.preventDefault()
    stepSectionEdge(section.id, edge, direction)
  }

  const valueMs = edge === 'start' ? section.startMs : section.endMs
  return (
    <div
      className="section-edge"
      data-edge={edge}
      role="slider"
      tabIndex={0}
      aria-label={`${EDGE_NAMES[edge]} ${section.name}`}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={valueMs}
      aria-valuetext={formatTime(valueMs)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragging.current = false
        show(null)
      }}
      onKeyDown={onKeyDown}
    />
  )
}

/**
 * Shows one section in the section band: a button with its name, a handle on each edge and a menu button.
 * A click on the name selects the time range of the section and scrolls the stage to its start.
 * The menu has "Rename", "Move section to voice" and "Delete".
 */
export function SectionBlock({ section, scale, durationMs }: SectionBlockProps) {
  const descriptionId = useId()
  const [preview, setPreview] = useState<TimeRange | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const nameButton = useRef<HTMLButtonElement>(null)
  const { leftPx, widthPx } = rangeToPx(scale, preview ?? section)

  function select() {
    const view = useViewStore.getState()
    view.setSelection({ startMs: section.startMs, endMs: section.endMs })
    view.setScroll(section.startMs)
  }

  function endRename(text: string | null, refocus: boolean) {
    setRenaming(false)
    setHint(null)
    if (text !== null) updateSection(section.id, { name: text })
    if (refocus) nameButton.current?.focus()
  }

  return (
    <div
      className="section-block"
      data-section-id={section.id}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
    >
      <EdgeHandle
        section={section}
        scale={scale}
        durationMs={durationMs}
        edge="start"
        onPreview={setPreview}
      />
      <button
        ref={nameButton}
        type="button"
        className="section-name"
        aria-describedby={descriptionId}
        title={section.name}
        onClick={select}
      >
        {section.name}
      </button>
      <span id={descriptionId} hidden>
        {`${formatTime(section.startMs)} – ${formatTime(section.endMs)}`}
      </span>
      <SectionMenu section={section} onRename={() => setRenaming(true)} />
      <EdgeHandle
        section={section}
        scale={scale}
        durationMs={durationMs}
        edge="end"
        onPreview={setPreview}
      />
      {renaming && (
        <div className="section-rename">
          <LabelEditor
            initial={section.name}
            name="Section name"
            onSave={(text, refocus) => endRename(text, refocus)}
            onCancel={() => endRename(null, true)}
            onTextChange={(text) => setHint(importNameHint(text))}
          />
          {hint !== null && (
            <p className="field-hint" role="status">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
