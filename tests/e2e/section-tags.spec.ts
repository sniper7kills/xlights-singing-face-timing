import { expect, type Page, test } from '@playwright/test'

const LYRICS = [
  '[Verse 1]',
  'Silent night, holy night!',
  'All is calm, all is bright',
  '[Chorus]',
  'Round yon virgin, mother and child',
  'Holy infant so tender and mild',
].join('\n')

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

function band(page: Page) {
  return page.getByRole('group', { name: 'Sections' })
}

test('makes the sections "Verse 1" and "Chorus" from the lyrics tags, and one undo removes them', async ({
  page,
}) => {
  await createSong(page)
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByLabel('Lyrics (optional)').fill(LYRICS)
  await expect(
    dialog.getByRole('checkbox', { name: 'Add sections from the [Name] tags' }),
  ).toBeChecked()
  await dialog.getByLabel('Lyrics only').check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  await expect(dialog).toBeHidden()

  const phrases = page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')
  await expect(phrases).toHaveCount(4)
  await expect(band(page).getByRole('button', { name: 'Verse 1', exact: true })).toBeVisible()
  await expect(band(page).getByRole('button', { name: 'Chorus', exact: true })).toBeVisible()
  const verseEnd = band(page).getByRole('slider', { name: 'End of Verse 1', exact: true })
  const chorusStart = band(page).getByRole('slider', { name: 'Start of Chorus', exact: true })
  const endMs = await verseEnd.getAttribute('aria-valuenow')
  expect(Number(endMs)).toBeGreaterThan(0)
  await expect(chorusStart).toHaveAttribute('aria-valuenow', endMs ?? '')
  await expect(phrases.first()).toHaveAttribute('title', 'Silent night, holy night!')

  await page.keyboard.press('ControlOrMeta+z')

  await expect(band(page).locator('.section-block')).toHaveCount(0)
  await expect(phrases).toHaveCount(4)
})
