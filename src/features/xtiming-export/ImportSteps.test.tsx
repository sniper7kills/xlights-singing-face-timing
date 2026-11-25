import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportSteps } from './ImportSteps.tsx'

const importItems = () =>
  within(screen.getByRole('list', { name: 'Import steps' })).getAllByRole('listitem')
const faceModelItems = () =>
  within(
    screen.getByRole('list', { name: 'Use the timing tracks with several face models' }),
  ).getAllByRole('listitem')

describe('ImportSteps', () => {
  it('shows the seven import steps of the feature file', () => {
    render(<ImportSteps frameMs={50} open onToggle={vi.fn()} />)

    const steps = importItems()
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
    expect(steps[4]).toHaveTextContent(
      'Drop a Faces effect on the row of the face model, from the start to the end of the song.',
    )
    expect(steps[5]).toHaveTextContent(
      'In the effect settings, under "Mouth Movements", select "Timing Track" and the timing track for that face model.',
    )
    expect(steps[6]).toHaveTextContent('Repeat steps 5 and 6 for each face model.')
  })

  it('shows the frame size of the song in step 2 with the 25 ms warning', () => {
    render(<ImportSteps frameMs={25} open onToggle={vi.fn()} />)

    const step2 = importItems()[1]
    expect(step2).toHaveTextContent(
      'Check the frame size: in "Sequence Settings", the tab "Info / Media" shows "Sequence Timing". It must match the frame size in this dialog: 25 ms.',
    )
    expect(step2).toHaveTextContent(
      'If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each time down to a multiple of 50 ms.',
    )
  })

  it('states how xLights changes the name of an imported timing track', () => {
    render(<ImportSteps frameMs={50} open onToggle={vi.fn()} />)

    expect(importItems()[3]).toHaveTextContent(
      'If a timing track with the same name exists in the sequence, xLights adds "_1" to the new name. xLights also removes & < > " \' = and each character that is not ASCII from a timing track name.',
    )
  })

  it('shows the five steps for a lead face model and chorus face models', () => {
    render(<ImportSteps frameMs={50} open onToggle={vi.fn()} />)

    const steps = faceModelItems()
    expect(steps).toHaveLength(5)
    expect(steps[2]).toHaveTextContent(
      'Under "Mouth Movements", select "Timing Track" and the timing track of the lead voice.',
    )
    expect(steps[3]).toHaveTextContent(
      'Put the effect on each face model, not on a model group. On a model group, xLights shows only a face definition of the type "Matrix".',
    )
    expect(steps[4]).toHaveTextContent(
      'In each of these effects, select the same timing track: the timing track of the chorus voice.',
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
