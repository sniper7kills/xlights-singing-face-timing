import { expect, test } from '@playwright/test'

// The speech model uses more than one CPU thread only in a cross-origin isolated page and worker.
// See docs/adr/0006-cross-origin-isolation-for-wasm-threads.md.
test('serves a cross-origin isolated page with SharedArrayBuffer', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin')
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  // The scripts are strings because the tsconfig of the tests has no DOM types.
  expect(await page.evaluate('crossOriginIsolated')).toBe(true)
  expect(await page.evaluate('typeof SharedArrayBuffer')).toBe('function')
})

test('starts the transcribe worker as a cross-origin isolated worker', async ({ page }) => {
  await page.addInitScript({ content: 'globalThis.__TRANSCRIBE_FIXTURE__ = true' })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  const workerEvent = page.waitForEvent('worker')

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  await page
    .getByRole('dialog', { name: 'Transcribe' })
    .getByRole('button', { name: 'Start' })
    .click()

  const worker = await workerEvent
  expect(await worker.evaluate('self.crossOriginIsolated')).toBe(true)
})
