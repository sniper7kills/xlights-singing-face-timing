import { type PointerEvent, useEffect, useRef } from 'react'
import { findMark } from '../../lib/marks/family.ts'
import { noEdit, type MarkEdit } from '../../lib/marks/markEdit.ts'
import { previewMove, previewResize } from '../../lib/marks/moveRules.ts'
import { moveMark } from '../../store/actions/moveMark.ts'
import { resizeMark } from '../../store/actions/resizeMark.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { clickMark } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'
import { makeTimeScale, pxToMs } from './timeScale.ts'
import { currentStageInput } from './useStageScale.ts'

/** A pointer that moves less than this distance gives a click, not a drag. */
const DRAG_THRESHOLD_PX = 4

/** What the drag changes: the body of the mark, or one edge. */
export type DragPart = 'body' | 'start' | 'end'

type Drag = {
  pointerId: number
  part: DragPart
  startX: number
  /** The pointer passed the threshold, so a release commits the drag. */
  moved: boolean
  /** The amount of the drag in milliseconds, unsnapped. The preview and the action snap it the same way. */
  deltaMs: number
}

function partOf(target: EventTarget): DragPart {
  const edge =
    target instanceof Element ? target.closest('[data-edge]')?.getAttribute('data-edge') : null
  return edge === 'start' || edge === 'end' ? edge : 'body'
}

/** Returns the edit that the drag gives now, from the same rule as the action. */
function dragEdit(id: string, drag: Drag): MarkEdit {
  const content = useSongStore.getState().current
  const mark = content && findMark(content.marks, id)
  if (!content || !mark) return noEdit()
  const { frameMs, durationMs } = content.song
  if (drag.part === 'body') return previewMove(content.marks, id, drag.deltaMs, frameMs, durationMs)
  const edgeMs = drag.part === 'start' ? mark.startMs : mark.endMs
  return previewResize(content.marks, id, drag.part, edgeMs + drag.deltaMs, frameMs, durationMs)
}

/** Calls the store action of the drag, as one undo step. */
function commitDrag(id: string, drag: Drag) {
  const mark = findMark(useSongStore.getState().current?.marks ?? [], id)
  if (!mark) return
  if (drag.part === 'body') moveMark(id, drag.deltaMs)
  else resizeMark(id, drag.part, (drag.part === 'start' ? mark.startMs : mark.endMs) + drag.deltaMs)
}

function deltaMsOf(drag: Drag, clientX: number): number {
  const content = useSongStore.getState().current
  if (!content) return 0
  const scale = makeTimeScale(currentStageInput(content.song.durationMs))
  return pxToMs(scale, clientX) - pxToMs(scale, drag.startX)
}

/**
 * Returns the pointer handlers of one mark.
 * - A press and a release with less than 4 px of movement is a click. See `clickMark`.
 * - A drag on an element with `data-edge="start"` or `data-edge="end"` moves that edge. Any other drag moves the mark.
 * - During the drag, the layers show the clamped result of `previewMove` or `previewResize`.
 * - The release calls `moveMark` or `resizeMark` once, so the drag is one undo step.
 * - `Escape` during the drag, a cancelled pointer or a lost pointer capture ends the drag with no change.
 * @param id The id of the mark.
 */
export function useMarkDrag(id: string) {
  const drag = useRef<Drag | null>(null)
  const stopKeys = useRef<(() => void) | null>(null)

  function end() {
    drag.current = null
    stopKeys.current?.()
    stopKeys.current = null
    useMarkUiStore.getState().showPreview(null)
  }

  useEffect(() => end, [])

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || drag.current !== null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      part: partOf(event.target),
      startX: event.clientX,
      moved: false,
      deltaMs: 0,
    }
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape') return
      // The key ends the drag only, so the editor keys must not also close a control or clear the selection.
      key.preventDefault()
      key.stopPropagation()
      end()
    }
    window.addEventListener('keydown', onKey, true)
    stopKeys.current = () => window.removeEventListener('keydown', onKey, true)
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return
    current.moved = true
    current.deltaMs = deltaMsOf(current, event.clientX)
    useMarkUiStore.getState().showPreview(dragEdit(id, current))
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    end()
    if (!current.moved) {
      clickMark(id, event.shiftKey)
      return
    }
    commitDrag(id, current)
    useViewStore.getState().selectMarks([id])
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: end,
    onLostPointerCapture: end,
  }
}
