import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json.
const DEMO_DURATION_MS = 28_900
const FIRST_WORD_START_MS = 100
// The second phrase, "All is calm, all is bright", is from 9800 ms to 18 700 ms.
const SELECTION = { startMs: 9500, endMs: 19_000 }

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

function words(page: Page) {
  return page.getByRole('list', { name: 'Words' }).getByRole('listitem')
}

/** Returns the page x of a time on the waveform that wavesurfer.js draws. */
async function waveformX(page: Page, ms: number): Promise<number> {
  // wavesurfer.js draws the waveform in this wrapper, so its box is the scale of the waveform.
  const wrapper = await box(page.locator('.waveform [part="wrapper"]'))
  return wrapper.x + (ms / DEMO_DURATION_MS) * wrapper.width
}

test('keeps the first word mark at the waveform position of its start at each zoom', async ({
  page,
}) => {
  await openDemoSong(page)
  const zoom = page.getByRole('slider', { name: 'Zoom' })
  await expect(zoom).toHaveAttribute('min', '10')
  await expect(zoom).toHaveAttribute('max', '1000')

  const silent = words(page).filter({ hasText: 'Silent' })
  const offsetPx = async () =>
    Math.abs((await box(silent)).x - (await waveformX(page, FIRST_WORD_START_MS)))
  await page.getByTestId('waveform-stage').hover()

  for (const pxPerSecond of ['200', '1000']) {
    await zoom.fill(pxPerSecond)
    await expect(zoom).toHaveValue(pxPerSecond)
    // The slider keeps the centre of the stage in place, so the wheel goes back to the song start.
    await page.mouse.wheel(0, -1_000_000)
    await expect(silent).toHaveCount(1)
    await expect.poll(offsetPx).toBeLessThanOrEqual(1)
  }

  // A wheel step of 120 px scrolls the waveform and the layers together.
  const before = (await box(silent)).x
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await box(silent)).x).toBeCloseTo(before - 120, 0)
  await expect.poll(offsetPx).toBeLessThanOrEqual(1)
})

test('keeps the play cursor in view after it passes the right edge', async ({ page }) => {
  await openDemoSong(page)
  // At 400 px for each second, the stage shows about 3 s of the song.
  await page.getByRole('slider', { name: 'Zoom' }).fill('400')
  const stage = await box(page.getByTestId('waveform-stage'))
  const visibleMs = (stage.width / 400) * 1000

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  // The play time passes the right edge of the first view.
  await expect
    .poll(async () => parsePlayTime(await page.getByLabel('Play time').textContent()), {
      timeout: 15_000,
    })
    .toBeGreaterThan(visibleMs + 500)

  const cursor = await box(page.getByTestId('play-cursor'))
  expect(cursor.x).toBeGreaterThanOrEqual(stage.x)
  expect(cursor.x).toBeLessThanOrEqual(stage.x + stage.width)
  await page.getByRole('button', { name: 'Pause' }).click()
})

function parsePlayTime(text: string | null): number {
  const match = /^(\d+):(\d+)\.(\d+)$/.exec(text ?? '')
  if (match === null) return 0
  return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(match[3])
}

test('runs a lyrics-only transcription on a time selection and keeps the marks outside it', async ({
  page,
}) => {
  await openDemoSong(page)
  const stage = await box(page.getByTestId('waveform-stage'))
  const xAt = (ms: number) => stage.x + (ms / DEMO_DURATION_MS) * stage.width
  const outside = async () => {
    const result: string[] = []
    for (const item of await words(page).all()) {
      const { x, width } = await box(item)
      if (x + width <= xAt(SELECTION.startMs) || x >= xAt(SELECTION.endMs))
        result.push(`${await item.getAttribute('title')} ${Math.round(x)} ${Math.round(width)}`)
    }
    return result
  }
  const before = await outside()
  expect(before).toHaveLength(10)

  const y = stage.y + stage.height / 2
  await page.mouse.move(xAt(SELECTION.startMs), y)
  await page.mouse.down()
  await page.mouse.move(xAt(14_000), y)
  await page.mouse.move(xAt(SELECTION.endMs), y)
  await page.mouse.up()
  await expect(page.getByTestId('time-selection')).toBeVisible()

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('radio', { name: /^The time selection/ }).check()
  await dialog.getByLabel('Lyrics (optional)').fill('Sleep in heavenly peace\nSleep in peace')
  await dialog.getByLabel('Lyrics only').check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')).toHaveCount(4)
  await expect(words(page)).toHaveCount(10 + 7)
  await expect(words(page).filter({ hasText: 'heavenly' })).toHaveCount(1)
  expect(await outside()).toEqual(before)
})
