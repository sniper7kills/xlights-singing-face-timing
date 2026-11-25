import { expect, test, type Page } from '@playwright/test'

const DEMO = 'public/demo/silent-night.ogg'

async function addDemoFile(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(DEMO)
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

test('states the purpose of the app above the drop zone and credits the models', async ({
  page,
}) => {
  await page.goto('/')

  const intro = page.getByText(/^Make the face models of your xLights show sing\./)
  await expect(intro).toBeVisible()
  const introBox = await intro.boundingBox()
  const dropBox = await page.getByRole('region', { name: 'Drop zone' }).boundingBox()
  expect(introBox?.y).toBeLessThan(dropBox?.y ?? 0)

  const credits = page.getByRole('region', { name: 'How it works' })
  await expect(credits).toContainText('Whisper speech model of OpenAI (MIT)')
  await expect(credits).toContainText('Spleeter by Deezer and the htdemucs model of Demucs')
  await expect(credits.getByRole('link', { name: 'Whisper' })).toHaveAttribute('target', '_blank')
})

test('keeps the demo song, the limits and a link style for the song name with songs', async ({
  page,
}) => {
  await addDemoFile(page)
  await page.goto('/#/')

  const dropZone = page.getByRole('region', { name: 'Drop zone' })
  await expect(dropZone.getByRole('button', { name: 'Try the demo song' })).toBeVisible()
  await expect(dropZone.getByText(/200 MB and 15 minutes at most/)).toBeVisible()
  const name = page.getByRole('link', { name: /silent-night/ }).locator('b')
  await expect(name).toHaveCSS('text-decoration-line', 'underline')
})

for (const width of [1440, 1024]) {
  test(`keeps a song name of 80 characters inside its row at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await addDemoFile(page)
    await page.goto('/#/')

    await page.getByRole('button', { name: 'Rename silent-night' }).click()
    const field = page.getByLabel('Song name')
    await field.fill('L'.repeat(80))
    await expect(page.getByText('A song name has 1 to 80 characters.')).toBeVisible()
    await field.press('Enter')

    const link = page.getByRole('link', { name: /L{80}/ })
    await expect(link.locator('b')).toHaveAttribute('title', 'L'.repeat(80))
    const row = await page.locator('.song').boundingBox()
    const list = await page.getByRole('region', { name: 'Your songs' }).boundingBox()
    const remove = await page.getByRole('button', { name: /^Delete L/ }).boundingBox()
    if (row === null || list === null || remove === null) throw new Error('A box is missing.')
    expect(row.x + row.width).toBeLessThanOrEqual(list.x + list.width + 0.5)
    expect(remove.x + remove.width).toBeLessThanOrEqual(row.x + row.width)
  })
}

test('states in the delete dialog that the delete is permanent', async ({ page }) => {
  await addDemoFile(page)
  await page.goto('/#/')

  await page.getByRole('button', { name: 'Delete silent-night' }).click()

  await expect(page.getByRole('alertdialog')).toContainText('You cannot undo this.')
})

test('keeps the selected theme after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Theme: switch to dark' }).click()
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Theme: switch to light' })).toBeVisible()
})

test('shows the message for a link to a song that does not exist', async ({ page }) => {
  await page.goto('/#/song/does-not-exist')

  await expect(page.getByRole('alert')).toHaveText(
    'The app did not find this song. It is possible that the song was deleted.',
  )
  await expect(page).toHaveURL(/#\/$/)
})

test('shows no message for an unknown route', async ({ page }) => {
  await page.goto('/#/bogus')

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('shows "Only one file was added." in the editor after a drop of two files', async ({
  page,
}) => {
  await page.goto('/')
  const dataTransfer = await page.evaluateHandle(async () => {
    const bytes = await (await fetch('demo/silent-night.ogg')).arrayBuffer()
    // The E2E tests compile with no DOM types, so the test reads the page class by name.
    const PageTransfer = Reflect.get(globalThis, 'DataTransfer') as new () => {
      items: { add: (file: File) => void }
    }
    const transfer = new PageTransfer()
    for (const name of ['first.ogg', 'second.ogg'])
      transfer.items.add(new File([bytes], name, { type: 'audio/ogg' }))
    return transfer
  })

  await page.getByRole('region', { name: 'Drop zone' }).dispatchEvent('drop', { dataTransfer })

  await expect(page.getByRole('heading', { level: 2, name: 'first' })).toBeVisible()
  await expect(page.locator('.toast')).toHaveText('Only one file was added.')
})

test('shows "Lead Vocals" in full in the voice rail', async ({ page }) => {
  await addDemoFile(page)

  const name = page.locator('.voice-name').first()
  await expect(name).toHaveText('Lead Vocals')
  expect(await name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const count = page.locator('.voice-count').first()
  expect(await count.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(20)
})

test('opens the song library from the note for a narrow window', async ({ page }) => {
  await addDemoFile(page)
  await page.setViewportSize({ width: 900, height: 800 })

  await page.getByRole('link', { name: 'Back to the song library' }).click()

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('region', { name: 'Your songs' })).toBeVisible()
})
