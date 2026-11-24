import { expect, test, type Page } from '@playwright/test'

const NOTE = 'The browser can remove songs when disk space is low. Export your work.'

async function usedBytes(page: Page): Promise<number> {
  return Number(await page.getByRole('meter', { name: 'Storage used' }).getAttribute('value'))
}

test('lists, renames and deletes a saved song across reloads', async ({ page }) => {
  await page.goto('/')
  const meter = page.getByRole('region', { name: 'Browser storage' })
  await expect(meter).toContainText(/^Browser storage[\d.]+ MB used of [\d.]+ MB allowed$/)

  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  await page.goto('/#/')
  await page.reload()
  const song = page.getByRole('link', { name: /silent-night/ })
  await expect(song).toContainText('0:29')
  await expect(song).toContainText(/Changed today \d\d:\d\d/)
  await expect(page.getByRole('region', { name: 'Drop zone' })).toHaveClass(/compact/)
  // Headless Chromium refuses persistent storage for a page without engagement.
  await expect(meter.getByRole('note')).toHaveText(NOTE)

  await page.getByRole('button', { name: 'Rename silent-night' }).click()
  await page.getByLabel('Song name').fill('  Silent Night  ')
  await page.getByLabel('Song name').press('Enter')
  await expect(page.getByRole('link', { name: /Silent Night/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: /Silent Night/ })).toContainText('0:29')

  const usedBefore = await usedBytes(page)
  await page.getByRole('button', { name: 'Delete Silent Night' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
  await expect.poll(() => usedBytes(page)).toBeLessThan(usedBefore)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Silent Night/ })).toHaveCount(0)
})

test('opens the editor when the person selects a song in the list', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await page.goto('/#/')

  await page.getByRole('link', { name: /silent-night/ }).focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/#\/song\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
})
