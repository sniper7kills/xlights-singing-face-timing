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
})
