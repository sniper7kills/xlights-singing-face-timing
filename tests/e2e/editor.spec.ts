import { expect, test } from '@playwright/test'

test('draws the waveform, plays and pauses with the space bar, and keeps the song after a reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  const region = page.getByRole('region', { name: 'Waveform' })
  await expect(region).toHaveAttribute('data-state', 'ready')
  // wavesurfer.js draws in an open shadow root, and CSS locators of Playwright pierce it.
  await expect(region.locator('canvas').first()).toBeVisible()
  const playTime = page.getByLabel('Play time')
  await expect(playTime).toHaveText('0:00.000')

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(playTime).not.toHaveText('0:00.000')

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  const pausedAt = await playTime.textContent()
  await page.waitForTimeout(300)
  await expect(playTime).toHaveText(pausedAt ?? '')

  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(region).toHaveAttribute('data-state', 'ready')
})

test('spans the full width of the waveform region at the default zoom', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  const region = page.getByRole('region', { name: 'Waveform' })
  await expect(region).toHaveAttribute('data-state', 'ready')

  // wavesurfer.js makes the wrapper wider than its container when the zoom needs a scroll.
  const containerBox = await region.locator('.waveform').boundingBox()
  const wrapperBox = await region.locator('[part="wrapper"]').boundingBox()

  expect(containerBox?.width).toBeGreaterThan(0)
  expect(wrapperBox?.width).toBe(containerBox?.width)
})
