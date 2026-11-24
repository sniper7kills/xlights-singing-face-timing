import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
