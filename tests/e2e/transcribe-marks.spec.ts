import { expect, type Page, test } from '@playwright/test'

const APP_ORIGIN = 'http://localhost:4173'

// The fixture worker returns the 16 words of public/demo/silent-night.marks.json.
// The gaps of 850 ms and 750 ms between the lines start a new phrase.
const FIXTURE_PHRASES = [
  'Silent night holy night',
  'All is calm all is bright',
  'Round yon virgin mother and child',
]

const LYRICS = [
  'Silent night, holy night!',
  'All is calm, all is bright',
  'Round yon virgin, mother and child',
  'Holy infant so tender and mild',
].join('\n')

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

function layer(page: Page, name: 'Phrases' | 'Words') {
  return page.getByRole('list', { name }).getByRole('listitem')
}

async function openDialog(page: Page) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeEnabled()
  return dialog
}

test('creates the fixture words and phrases, asks before a second run, and keeps them after a reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await createSong(page)

  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Start' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(layer(page, 'Words')).toHaveCount(16)
  await expect(layer(page, 'Words').first()).toHaveText('Silent')
  await expect(layer(page, 'Words').last()).toHaveText('child')
  await expect(layer(page, 'Phrases')).toHaveCount(3)
  for (const [i, label] of FIXTURE_PHRASES.entries())
    await expect(layer(page, 'Phrases').nth(i)).toHaveAttribute('title', label)

  const again = await openDialog(page)
  await again.getByRole('button', { name: 'Start' }).click()
  await expect(
    again.getByText(/^The run replaces the \d+ marks of ".+" from 0:00\.000 to \d:\d\d\.\d{3}\.$/),
  ).toBeVisible()
  await again.getByRole('button', { name: 'Cancel' }).click()
  await again.getByRole('button', { name: 'Close' }).click()
  await expect(layer(page, 'Words')).toHaveCount(16)

  await expect(page.locator('.save-state')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(layer(page, 'Words')).toHaveCount(16)
  await expect(layer(page, 'Phrases')).toHaveCount(3)
})

test('creates four phrases from four lyrics lines with no request outside the app', async ({
  page,
}) => {
  const outside: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(APP_ORIGIN) && !request.url().startsWith('blob:'))
      outside.push(request.url())
  })
  await createSong(page)

  const dialog = await openDialog(page)
  await dialog.getByLabel('Lyrics (optional)').fill(LYRICS)
  await dialog.getByLabel('Lyrics only').check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByText('22 words, 22 estimated')).toBeVisible()
  await expect(layer(page, 'Phrases')).toHaveCount(4)
  await expect(layer(page, 'Phrases').first()).toHaveAttribute('title', 'Silent night, holy night!')
  await expect(layer(page, 'Words')).toHaveCount(22)
  await expect(layer(page, 'Words').nth(1)).toHaveAttribute('title', 'night')
  expect(outside).toEqual([])
})
