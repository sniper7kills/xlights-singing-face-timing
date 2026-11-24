import { expect, test } from '@playwright/test'
import { makeTimeScale, msToPx } from '../../src/features/timeline-editor/timeScale.ts'

// The demo song: public/demo/silent-night.marks.json.
const DEMO_DURATION_MS = 28_900
const FIRST_WORD_START_MS = 100

test('shows the marks of the demo song on the three layers on the time scale of the waveform', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()

  const phrases = page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')
  const words = page.getByRole('list', { name: 'Words' }).getByRole('listitem')
  const phonemes = page.getByRole('list', { name: 'Phonemes' }).getByRole('listitem')
  await expect(phrases).toHaveCount(3)
  await expect(words).toHaveCount(16)
  await expect(phonemes).toHaveCount(51)
  await expect(phrases.first()).toHaveAttribute('title', 'Silent night, holy night')
  await expect(words.first()).toHaveText('Silent')

  const region = page.getByRole('region', { name: 'Waveform' })
  await expect(region).toHaveAttribute('data-state', 'ready')
  // wavesurfer.js draws the waveform in this wrapper, so its box is the scale of the waveform.
  const waveBox = await region.locator('[part="wrapper"]').boundingBox()
  const wordBox = await words.first().boundingBox()
  if (!waveBox || !wordBox) throw new Error('The waveform or the first word has no box.')

  const scale = makeTimeScale({
    widthPx: waveBox.width,
    durationMs: DEMO_DURATION_MS,
    pxPerSecond: null,
    scrollMs: 0,
  })
  expect(wordBox.x).toBeCloseTo(waveBox.x + msToPx(scale, FIRST_WORD_START_MS), 0)
})

test('shows the empty state of the layers for a song from an audio file', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  const layers = page.getByRole('region', { name: 'Layers' })
  await expect(layers.getByText('No marks yet. Select Transcribe to find the words.')).toBeVisible()
  await expect(layers.getByRole('button', { name: 'Transcribe' })).toBeVisible()
  await expect(layers.getByRole('list')).toHaveCount(0)
})
