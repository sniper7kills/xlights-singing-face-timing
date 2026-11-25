import { expect, test } from '@playwright/test'

test('shows the app name and the empty song library', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Singing Face Timing')
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
})

test('serves the favicon with no console error', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  for (const path of ['/favicon.svg', '/favicon.ico']) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
  expect(errors).toEqual([])
})
