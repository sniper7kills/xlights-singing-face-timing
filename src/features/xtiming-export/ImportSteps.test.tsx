import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportSteps } from './ImportSteps.tsx'

describe('ImportSteps', () => {
  it('shows the seven import steps of the feature file', () => {
    render(<ImportSteps frameMs={50} open onToggle={vi.fn()} />)

    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(7)
    expect(steps[0]).toHaveTextContent(
      'Open the sequence in xLights. Use the same audio file, so the times match.',
    )
    expect(steps[2]).toHaveTextContent(
      'Right-click a timing row heading and select "Import Timing Track".',
    )
    expect(steps[3]).toHaveTextContent(
      'Select the .xtiming file. If the file has several timing tracks, xLights adds one timing track for each.',
    )
    expect(steps[4]).toHaveTextContent('Drop a Faces effect on the row of the face model.')
    expect(steps[5]).toHaveTextContent(
      'In the effect settings, under "Mouth Movements", select the timing track for that face model.',
    )
    expect(steps[6]).toHaveTextContent('Repeat steps 5 and 6 for each face model.')
  })

  it('shows the frame size of the song in step 2 with the 25 ms warning', () => {
    render(<ImportSteps frameMs={25} open onToggle={vi.fn()} />)

    const step2 = screen.getAllByRole('listitem')[1]
    expect(step2).toHaveTextContent(
      'Check the frame size: Sequence Settings shows 25 ms or 50 ms. It must match the frame size in this dialog: 25 ms.',
    )
    expect(step2).toHaveTextContent(
      'If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each time down to a multiple of 50 ms.',
    )
  })

  it('states that xLights renames a timing track whose name exists in the sequence', () => {
    render(<ImportSteps frameMs={50} open onToggle={vi.fn()} />)

    expect(screen.getAllByRole('listitem')[3]).toHaveTextContent(
      'If a timing track with the same name exists in the sequence, xLights renames the imported timing track.',
    )
  })

  it('reports the new state when the person collapses the steps', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ImportSteps frameMs={50} open onToggle={onToggle} />)

    await user.click(screen.getByText('Next, in xLights'))

    await vi.waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(false))
  })
})
