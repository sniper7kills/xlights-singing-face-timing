import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HowItWorks } from './HowItWorks.tsx'

describe('HowItWorks', () => {
  it('acknowledges Carnegie Mellon University and links the dictionary licence', () => {
    render(<HowItWorks />)

    expect(screen.getByRole('region', { name: 'How it works' })).toHaveTextContent(
      'The app uses the CMU Pronouncing Dictionary of Carnegie Mellon University (licence).',
    )
    expect(screen.getByRole('link', { name: 'CMU Pronouncing Dictionary' })).toHaveAttribute(
      'href',
      'https://github.com/cmusphinx/cmudict',
    )
    expect(screen.getByRole('link', { name: 'licence' })).toHaveAttribute(
      'href',
      'dict/cmudict-LICENSE.txt',
    )
  })

  it('credits the two singer models and links the CC BY 4.0 licence', () => {
    render(<HowItWorks />)

    expect(screen.getByRole('region', { name: 'How it works' })).toHaveTextContent(
      'The singer option uses the wespeaker-voxceleb-resnet34-LM model of the WeSpeaker project (CC BY 4.0) and the segmentation-3.0 model of pyannote (MIT).',
    )
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
    expect(screen.getByRole('link', { name: 'wespeaker-voxceleb-resnet34-LM' })).toHaveAttribute(
      'href',
      'https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM',
    )
  })
})
