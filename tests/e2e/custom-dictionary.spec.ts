import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

function openDialog(page: Page) {
  return page.locator('.header').getByRole('button', { name: 'Custom dictionary' }).click()
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'Custom dictionary' })
}

function entryRow(page: Page, word: string) {
  return dialog(page).getByRole('table', { name: 'Custom words' }).getByRole('row', { name: word })
}

test('adds a custom entry, keeps it after a reload, exports it, imports it in a clean browser and deletes it', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await openDialog(page)
  await expect(dialog(page).getByText(/^No custom words yet\./)).toBeVisible()

  await dialog(page).getByRole('textbox', { name: 'Word', exact: true }).fill('RUDOLPH')
  await dialog(page).getByRole('radio', { name: 'Symbols' }).check()
  await dialog(page).getByRole('textbox', { name: 'CMU symbols' }).fill('R UW1 D AA0 L F')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(entryRow(page, 'RUDOLPH')).toContainText('R UW1 D AA0 L F')
  await expect(entryRow(page, 'RUDOLPH')).toContainText('etc U etc AI L FV')

  await page.reload()
  await openDialog(page)
  await expect(entryRow(page, 'RUDOLPH')).toContainText('etc U etc AI L FV')

  const downloadEvent = page.waitForEvent('download')
  await dialog(page).getByRole('button', { name: 'Export' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('custom-dictionary.txt')
  const text = await readFile(await download.path(), 'utf8')
  expect(text.split('\n').filter((line) => !line.startsWith(';;;'))).toEqual([
    'RUDOLPH  R UW1 D AA0 L F',
    '',
  ])

  const clean = await browser.newContext()
  const other = await clean.newPage()
  await other.goto('/')
  await openDialog(other)
  await expect(dialog(other).getByText(/^No custom words yet\./)).toBeVisible()
  await dialog(other)
    .getByLabel('Custom dictionary file')
    .setInputFiles({
      name: 'custom-dictionary.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    })
  await expect(dialog(other).getByRole('status')).toHaveText('1 entry imported.')
  await expect(entryRow(other, 'RUDOLPH')).toContainText('R UW1 D AA0 L F')
  await clean.close()

  await entryRow(page, 'RUDOLPH').getByRole('button', { name: 'Delete RUDOLPH' }).click()
  await expect(dialog(page).getByText(/^No custom words yet\./)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(
    page.locator('.header').getByRole('button', { name: 'Custom dictionary' }),
  ).toBeFocused()
})

test('imports the good line of a file and reports the cause of each bad line near "Import"', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openDialog(page)

  await dialog(page)
    .getByLabel('Custom dictionary file')
    .setInputFiles({
      name: 'words.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(';;; carols\nBLITZEN  B L IH1 T S AH0 N\nROODOLF  R XX\nCOMET\n'),
    })

  const status = dialog(page).getByRole('status')
  await expect(status).toContainText('1 entry imported. 2 lines skipped.')
  await expect(status.getByRole('listitem')).toHaveText([
    'Line 3: “XX” is not a symbol.',
    'Line 4: no symbols.',
  ])
  await expect(status).toBeInViewport()
  await expect(entryRow(page, 'BLITZEN')).toContainText('B L IH1 T S AH0 N')
})

test('starts a new entry on "Sounds like spelling" and shows the mouth shapes before the save', async ({
  page,
}) => {
  await page.goto('/')
  await openDialog(page)

  await expect(dialog(page).getByRole('radio', { name: 'Sounds like spelling' })).toBeChecked()
  const soundsLike = dialog(page).getByRole('textbox', { name: 'Sounds like' })
  await expect(soundsLike).toHaveAccessibleDescription(
    'Type the word as it sounds, with words that you know. Example: "sore block".',
  )
  await dialog(page).getByRole('textbox', { name: 'Word', exact: true }).fill('ZORBLUK')
  await soundsLike.fill('sore block')

  await expect(dialog(page).getByText('Mouth shapes: etc O etc MBP L AI etc')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(entryRow(page, 'ZORBLUK')).toContainText('S AO1 R B L AA1 K')
})

test('shows the CMU symbol reference in the window from the link beside the symbols field', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openDialog(page)
  await dialog(page).getByRole('radio', { name: 'Symbols' }).check()
  await expect(
    dialog(page).getByText(/The symbols come from the CMU Pronouncing Dictionary\.$/),
  ).toBeVisible()

  await dialog(page).getByRole('button', { name: 'Show the list of symbols' }).click()

  const reference = dialog(page).getByRole('table', { name: 'CMU symbols' })
  await expect(reference).toBeVisible()
  await expect(reference).toBeInViewport()
  await expect(
    dialog(page).getByText('CMU symbols', { exact: true }).and(page.locator('summary')),
  ).toBeFocused()
})

test('opens the custom dictionary from the editor top bar', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(
    page.locator('.header').getByRole('button', { name: 'Custom dictionary' }),
  ).toHaveCount(0)

  await page.locator('.editor-top').getByRole('button', { name: 'Custom dictionary' }).click()

  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('searchbox', { name: 'Search' })).toBeFocused()
})
