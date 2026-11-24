import { expect, test } from '@playwright/test'

test('shows the app name and the empty song library', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Singing Face Timing')
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
})
