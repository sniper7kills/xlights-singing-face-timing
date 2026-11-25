import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. It is 28 900 ms long.
const DEMO_DURATION_MS = 28_900

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

function rail(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' })
}

/** Drags a time selection on the waveform. A time after the song end drags past the right edge of the stage. */
async function selectTime(page: Page, fromMs: number, toMs: number) {
  const stage = await box(page.getByTestId('waveform-stage'))
  const xAt = (ms: number) => stage.x + (ms / DEMO_DURATION_MS) * stage.width
  const y = stage.y + stage.height / 2
  await page.mouse.move(xAt(fromMs), y)
  await page.mouse.down()
  await page.mouse.move(xAt((fromMs + toMs) / 2), y)
  await page.mouse.move(xAt(toMs), y)
  await page.mouse.up()
  await expect(page.getByTestId('time-selection')).toBeVisible()
}

/** Fails unless the whole element is inside the window. */
async function expectInsideWindow(page: Page, locator: Locator) {
  const found = await box(locator)
  const view = page.viewportSize()
  if (view === null) throw new Error('The page has no viewport size.')
  expect(found.x).toBeGreaterThanOrEqual(0)
  expect(found.y).toBeGreaterThanOrEqual(0)
  expect(found.x + found.width).toBeLessThanOrEqual(view.width)
  expect(found.y + found.height).toBeLessThanOrEqual(view.height)
}

for (const width of [1440, 1024]) {
  test(`shows the whole menu of a section that ends at the song end at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await openDemoSong(page)
    await selectTime(page, 15_000, DEMO_DURATION_MS + 2000)
    await page.getByRole('button', { name: 'Add section', exact: true }).click()
    await page.getByRole('textbox', { name: 'Section name' }).fill('Chorus')
    await page.getByRole('textbox', { name: 'Section name' }).press('Enter')

    const button = band(page).getByRole('button', { name: 'Actions for Chorus', exact: true })
    await button.click()
    const menu = page.getByRole('menu', { name: 'Actions for Chorus' })
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
    await expectInsideWindow(page, menu)
    // The menu opens under its button, outside the stage that clips its content.
    expect((await box(menu)).y).toBeGreaterThan((await box(button)).y)
    await expect(menu.getByRole('menuitem', { name: 'Move section to voice' })).toBeVisible()
  })
}

test('shows the whole menu of the last voice of 12 near the bottom of the rail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openDemoSong(page)
  const add = rail(page).getByRole('button', { name: 'Add voice' })
  for (let n = 2; n <= 12; n += 1) {
    await add.click()
    await expect(rail(page).getByRole('listitem')).toHaveCount(n)
  }

  const button = rail(page).getByRole('button', { name: 'Actions for Voice 12', exact: true })
  await button.scrollIntoViewIfNeeded()
  await button.click()
  const menu = page.getByRole('menu', { name: 'Actions for Voice 12' })
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
  await expectInsideWindow(page, menu)

  await menu.getByRole('menuitem', { name: 'Colour' }).click()
  const colours = page.getByRole('menu', { name: 'Colour of Voice 12' })
  await expect(colours.getByRole('menuitemradio')).toHaveCount(12)
  await expectInsideWindow(page, colours)
})

test('adds a new section when a click elsewhere takes the focus from its name field, and keeps it after a reload', async ({
  page,
}) => {
  await openDemoSong(page)
  await selectTime(page, 2000, 7000)
  await page.getByRole('button', { name: 'Add section', exact: true }).click()
  await page.getByRole('textbox', { name: 'Section name' }).fill('Verse 1')

  await rail(page).getByRole('heading', { name: 'Voices' }).click()

  await expect(page.getByRole('textbox', { name: 'Section name' })).toHaveCount(0)
  await expect(band(page).getByRole('button', { name: 'Verse 1', exact: true })).toBeVisible()
  await expect(page.locator('.save-state')).toHaveText('Saved')
  await page.reload()
  await expect(band(page).getByRole('button', { name: 'Verse 1', exact: true })).toBeVisible()
})

test('states in the status line that the app made a new section start after a section', async ({
  page,
}) => {
  await openDemoSong(page)
  await selectTime(page, 0, 16_000)
  await page.getByRole('button', { name: 'Add section', exact: true }).click()
  await page.getByRole('textbox', { name: 'Section name' }).fill('Verse 1')
  await page.getByRole('textbox', { name: 'Section name' }).press('Enter')
  await expect(band(page).getByRole('button', { name: 'Verse 1', exact: true })).toBeVisible()

  await selectTime(page, 14_000, 23_000)
  await page.getByRole('button', { name: 'Add section', exact: true }).click()
  await page.getByRole('textbox', { name: 'Section name' }).fill('Over')
  await page.getByRole('textbox', { name: 'Section name' }).press('Enter')

  await expect(page.locator('.status-line')).toHaveText(
    /^The section starts at 0:\d\d\.\d{3}, after "Verse 1"\.$/,
  )
})
