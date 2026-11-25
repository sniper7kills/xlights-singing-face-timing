import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { MarkView } from './MarkView.tsx'

const SCALE = { pxPerMs: 0.1, scrollMs: 0 }

function renderMark(overrides: Partial<Mark>) {
  const mark: Mark = {
    id: 'w1',
    voiceId: 'v1',
    layer: 'word',
    label: 'Zxqv',
    startMs: 0,
    endMs: 1000,
    parentId: null,
    edited: false,
    ...overrides,
  }
  render(
    <ul>
      <MarkView mark={mark} scale={SCALE} />
    </ul>,
  )
  return screen.getByRole('listitem')
}

beforeEach(() => {
  useViewStore.getState().resetView()
})

describe('MarkView', () => {
  it('marks an unknown word for the dotted border and tells a screen reader that the word is unknown', () => {
    const item = renderMark({ unknown: true })

    expect(item).toHaveAttribute('data-unknown', 'true')
    expect(item).toHaveTextContent('Zxqv (unknown word)')
    expect(item).not.toHaveAttribute('aria-current')
  })

  it('shows a selected unknown word with the selection and the unknown state', () => {
    useViewStore.getState().selectMarks(['w1'])
    const item = renderMark({ unknown: true })

    expect(item).toHaveAttribute('data-unknown', 'true')
    expect(item).toHaveAttribute('aria-current', 'true')
  })

  it.each([
    ['a known word', { unknown: false }],
    ['a word with no break down', {}],
  ])('shows %s without the unknown state', (_, overrides) => {
    const item = renderMark(overrides)

    expect(item).not.toHaveAttribute('data-unknown')
    expect(item).toHaveTextContent(/^Zxqv$/)
  })

  it('shows a phoneme without the unknown state', () => {
    const item = renderMark({ layer: 'phoneme', label: 'etc', unknown: true })

    expect(item).not.toHaveAttribute('data-unknown')
  })

  it('marks an estimated word for the dashed frame and tells a screen reader that its time is estimated', () => {
    const item = renderMark({ estimated: true })

    expect(item).toHaveAttribute('data-estimated', 'true')
    expect(item).not.toHaveAttribute('data-unknown')
    expect(item).toHaveTextContent('Zxqv (estimated time)')
  })

  it('shows a selected word that is estimated and unknown with all three states', () => {
    useViewStore.getState().selectMarks(['w1'])
    const item = renderMark({ estimated: true, unknown: true })

    expect(item).toHaveAttribute('data-estimated', 'true')
    expect(item).toHaveAttribute('data-unknown', 'true')
    expect(item).toHaveAttribute('aria-current', 'true')
    expect(item).toHaveTextContent('Zxqv (estimated time) (unknown word)')
  })

  it('shows a word with no estimated time without the estimated state', () => {
    const item = renderMark({ estimated: false })

    expect(item).not.toHaveAttribute('data-estimated')
  })

  it('shows a phrase without the estimated state', () => {
    const item = renderMark({ layer: 'phrase', estimated: true })

    expect(item).not.toHaveAttribute('data-estimated')
  })

  describe('a short or a narrow mark', () => {
    beforeEach(() => {
      // The song has a frame size of 50 ms.
      useSongStore.setState({ current: makeSongContent() })
    })

    afterEach(() => {
      useSongStore.setState({ current: null })
    })

    it('gives a word of 2 frames the short look and tells a screen reader', () => {
      const item = renderMark({ startMs: 0, endMs: 100 })

      expect(item).toHaveAttribute('data-short', 'true')
      expect(item).toHaveTextContent('Zxqv (short mark)')
    })

    it('gives a word of 3 frames no short look', () => {
      expect(renderMark({ startMs: 0, endMs: 150 })).not.toHaveAttribute('data-short')
    })

    it('gives a phoneme of 1 frame no short look', () => {
      expect(renderMark({ layer: 'phoneme', label: 'O', endMs: 50 })).not.toHaveAttribute(
        'data-short',
      )
    })

    it('draws a mark of 1 frame at its own width with no visible label', () => {
      // At 0.1 px for each ms, 50 ms is 5 px.
      const item = renderMark({ startMs: 0, endMs: 50 })

      expect(item).toHaveStyle({ width: '5px' })
      expect(item).toHaveAttribute('data-narrow', 'true')
      expect(item.querySelector('.mark-label')).toBeNull()
      expect(item).toHaveTextContent(/^Zxqv/)
    })

    it('puts the handles of a narrow selected mark outside the mark', () => {
      useViewStore.getState().selectMarks(['w1'])
      const item = renderMark({ startMs: 0, endMs: 50 })

      expect(item).toHaveAttribute('data-handles', 'outer')
      expect(item.querySelectorAll('[data-edge]')).toHaveLength(2)
    })

    it('keeps the handles of a wide selected mark inside the mark', () => {
      useViewStore.getState().selectMarks(['w1'])

      expect(renderMark({})).toHaveAttribute('data-handles', 'inner')
    })
  })
})
