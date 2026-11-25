import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. It is 28 900 ms long with a frame size of 50 ms.
// Its three phrases: 100–8950, 9800–18700 and 19450–28750 ms.
const DEMO_DURATION_MS = 28_900
const FRAME_MS = 50

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

function band(page: Page) {
  return page.getByRole('group', { name: 'Sections' })
}

function sectionButton(page: Page, name: string) {
  return band(page).getByRole('button', { name, exact: true })
}

/** Returns the horizontal page position of a time at the default zoom. */
async function xAt(page: Page, ms: number) {
  const stage = await box(page.getByTestId('waveform-stage'))
  return stage.x + (ms / DEMO_DURATION_MS) * stage.width
}

/** Drags a time selection on the waveform from one time to another. */
async function selectTime(page: Page, fromMs: number, toMs: number) {
  const stage = await box(page.getByTestId('waveform-stage'))
  const y = stage.y + stage.height / 2
  await page.mouse.move(await xAt(page, fromMs), y)
  await page.mouse.down()
  await page.mouse.move(await xAt(page, (fromMs + toMs) / 2), y)
  await page.mouse.move(await xAt(page, toMs), y)
  await page.mouse.up()
  await expect(page.getByTestId('time-selection')).toBeVisible()
}

/** Selects a time range and adds a section with the default name. */
async function addSection(page: Page, fromMs: number, toMs: number) {
  await selectTime(page, fromMs, toMs)
  await page.getByRole('button', { name: 'Add section', exact: true }).click()
  await page.getByRole('textbox', { name: 'Section name' }).press('Enter')
}

async function sectionMenu(page: Page, name: string, item: string) {
  await band(page)
    .getByRole('button', { name: `Actions for ${name}`, exact: true })
    .click()
  await page
    .getByRole('menu', { name: `Actions for ${name}` })
    .getByRole('menuitem', { name: item, exact: true })
    .click()
}

async function valueOf(slider: Locator) {
  return Number(await slider.getAttribute('aria-valuenow'))
}

test('adds, selects and renames a section, and stops a dragged edge at the next section', async ({
  page,
}) => {
  await openDemoSong(page)
  await expect(band(page)).toHaveText('Drag on the waveform, then Add section')

  await addSection(page, 2000, 7000)
  await expect(sectionButton(page, 'Section 1')).toBeVisible()
  const block = band(page).locator('.section-block')
  await expect(block).toHaveCount(1)

  // A click on the waveform clears the time selection. A click on the section selects its range again.
  const selection = page.getByTestId('time-selection')
  await page.getByTestId('waveform-stage').click({ position: { x: 5, y: 5 } })
  await expect(selection).toHaveCount(0)
  await sectionButton(page, 'Section 1').click()
  const blockBox = await box(block)
  const selectionBox = await box(selection)
  expect(Math.abs(selectionBox.x - blockBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(selectionBox.width - blockBox.width)).toBeLessThanOrEqual(2)

  await sectionMenu(page, 'Section 1', 'Rename')
  const field = page.getByRole('textbox', { name: 'Section name' })
  await field.fill('Verse 1')
  await field.press('Enter')
  await expect(sectionButton(page, 'Verse 1')).toBeVisible()

  await addSection(page, 12_000, 20_000)
  await expect(sectionButton(page, 'Section 1')).toBeVisible()

  const end = band(page).getByRole('slider', { name: 'End of Verse 1', exact: true })
  const nextStart = band(page).getByRole('slider', { name: 'Start of Section 1', exact: true })
  const handle = await box(end)
  const y = handle.y + handle.height / 2
  await page.mouse.move(handle.x + handle.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(await xAt(page, 10_000), y)
  await page.mouse.move(await xAt(page, 25_000), y)
  await page.mouse.up()

  await expect.poll(() => valueOf(end)).toBe(await valueOf(nextStart))
  expect((await valueOf(end)) % FRAME_MS).toBe(0)
})

test('scrolls the stage to the start of a section after a click at a zoom', async ({ page }) => {
  await openDemoSong(page)
  await addSection(page, 12_000, 20_000)
  await expect(sectionButton(page, 'Section 1')).toBeVisible()

  // The zoom keeps the centre of the stage, about 14 s, in view. The section start is then left of the view.
  await page.getByRole('slider', { name: 'Zoom' }).fill('200')
  const stage = await box(page.getByTestId('waveform-stage'))
  const block = band(page).locator('.section-block')
  await expect.poll(async () => (await box(block)).x).toBeLessThan(stage.x - 50)

  // A mouse click at the visible part of the block does not scroll the clipped stage.
  await page.mouse.click(stage.x + stage.width / 2, (await box(block)).y + 8)

  await expect.poll(async () => Math.abs((await box(block)).x - stage.x)).toBeLessThanOrEqual(2)
})

test('moves each phrase of a section to another voice', async ({ page }) => {
  await openDemoSong(page)
  const rail = page.getByRole('complementary', { name: 'Voices' })
  await rail.getByRole('button', { name: 'Add voice' }).click()
  await expect(rail.getByRole('button', { name: 'Voice 2', exact: true })).toBeVisible()

  // The section holds the middle of the second phrase only.
  await addSection(page, 10_000, 18_000)
  await sectionMenu(page, 'Section 1', 'Move section to voice')
  await page
    .getByRole('menu', { name: 'Move section to voice' })
    .getByRole('menuitem', { name: 'Voice 2', exact: true })
    .click()

  await expect(
    rail.getByRole('button', { name: 'Voice 2', exact: true }),
  ).toHaveAccessibleDescription('1 phrase')
  await expect(
    rail.getByRole('button', { name: 'Lead Vocals', exact: true }),
  ).toHaveAccessibleDescription('2 phrases')
  await expect(page.getByRole('list', { name: 'Phrases' })).toBeFocused()
})

test('deletes a section and leaves every mark', async ({ page }) => {
  await openDemoSong(page)
  const layers = ['Phrases', 'Words', 'Phonemes']
  const counts = async () =>
    Promise.all(
      layers.map((name) => page.getByRole('list', { name }).getByRole('listitem').count()),
    )
  const before = await counts()

  await addSection(page, 2000, 7000)
  await sectionMenu(page, 'Section 1', 'Delete')

  await expect(band(page)).toHaveText('Drag on the waveform, then Add section')
  expect(await counts()).toEqual(before)
})
