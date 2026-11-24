import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms.
const DEMO_DURATION_MS = 28_900
// The word "holy" is from 4700 ms to 6700 ms. Its phoneme O is from 4900 ms to 5600 ms.
const INSIDE_O_MS = 5250
// The first phrase ends at 8950 ms and the second phrase starts at 9800 ms with the phoneme O.
const BETWEEN_PHRASES_MS = 9400

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

/** Moves the play cursor with a click on the waveform at a time of the song. */
async function seek(page: Page, ms: number) {
  // wavesurfer.js draws the waveform in this wrapper, so its box is the scale of the waveform.
  const wrapper = await box(page.locator('.waveform [part="wrapper"]'))
  await page.mouse.click(wrapper.x + (ms / DEMO_DURATION_MS) * wrapper.width, wrapper.y + 20)
}

function word(page: Page, label: string): Locator {
  return page
    .getByRole('list', { name: 'Words' })
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}$`) })
}

test('shows the fields of a clicked word and changes the word for a typed end time', async ({
  page,
}) => {
  await openDemoSong(page)
  const holy = word(page, 'holy')
  const widthBefore = (await box(holy)).width
  await holy.click()
  await expect(holy).toHaveAttribute('aria-current', 'true')

  const fields = page.getByRole('complementary', { name: 'Inspector' }).getByRole('region', {
    name: 'Selected word',
  })
  await expect(fields.getByRole('textbox', { name: 'Label' })).toHaveValue('holy')
  await expect(fields.getByRole('textbox', { name: 'Start' })).toHaveValue('0:04.700')
  const end = fields.getByRole('textbox', { name: 'End' })
  await expect(end).toHaveValue('0:06.700')
  await expect(fields.getByText('2000 ms · 40 frames')).toBeVisible()

  await end.fill('0:06.200')
  await end.press('Enter')
  await expect(end).toHaveValue('0:06.200')
  await expect(fields.getByText('1500 ms · 30 frames')).toBeVisible()
  await expect.poll(async () => (await box(holy)).width).toBeLessThan(widthBefore * 0.8)

  await end.fill('later')
  await end.press('Enter')
  await expect(fields.getByRole('alert')).toHaveText('Use m:ss.mmm')
  await expect(fields.getByText('1500 ms · 30 frames')).toBeVisible()
})

test('shows the phoneme label under the play time in the face preview', async ({ page }) => {
  await openDemoSong(page)
  const phoneme = page.getByTestId('face-phoneme')
  await expect(phoneme).toHaveText('rest')

  await seek(page, INSIDE_O_MS)
  await expect(phoneme).toHaveText('O')
  await expect(page.getByRole('img', { name: 'Face preview, mouth shape O' })).toBeVisible()

  await seek(page, BETWEEN_PHRASES_MS)
  await expect(phoneme).toHaveText('rest')

  // The play reaches the phoneme O of "All" at 9800 ms, so the label changes during play.
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(phoneme).not.toHaveText('rest', { timeout: 5000 })
  await page.getByRole('button', { name: 'Pause' }).click()
})
