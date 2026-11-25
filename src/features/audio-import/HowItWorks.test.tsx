import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HowItWorks } from './HowItWorks.tsx'

describe('HowItWorks', () => {
  it('credits the Whisper speech model and its MIT licence', () => {
    render(<HowItWorks />)

    expect(screen.getByRole('region', { name: 'How it works' })).toHaveTextContent(
      'The transcribe step uses the Whisper speech model of OpenAI (MIT), in the ONNX files of onnx-community.',
    )
    expect(screen.getByRole('link', { name: 'Whisper' })).toHaveAttribute(
      'href',
      'https://github.com/openai/whisper',
    )
    expect(screen.getByRole('link', { name: 'MIT' })).toHaveAttribute(
      'href',
      'https://github.com/openai/whisper/blob/main/LICENSE',
    )
  })

  it('credits the two vocal separation models and links their licence notes', () => {
    render(<HowItWorks />)

    expect(screen.getByRole('region', { name: 'How it works' })).toHaveTextContent(
      'The vocal separation option uses the 2-stem model of Spleeter by Deezer and the htdemucs model of Demucs by Meta.',
    )
    expect(screen.getByRole('link', { name: 'Spleeter' })).toHaveAttribute(
      'href',
      'https://github.com/deezer/spleeter',
    )
    expect(screen.getByRole('link', { name: 'Demucs' })).toHaveAttribute(
      'href',
      'https://github.com/adefossez/demucs',
    )
    expect(screen.getByRole('link', { name: 'licence notes' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/docs\/licences\/README\.md$/),
    )
  })

  it('opens each credit link in a new tab with no referrer', () => {
    render(<HowItWorks />)

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })

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
