import { expect, test } from '@playwright/test'

test('opens one dialog at a time, and the space bar does not play the audio in a dialog', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
  const top = page.locator('.editor-top')
  const transcribeAction = top.getByRole('button', { name: 'Transcribe' })
  const exportAction = top.getByRole('button', { name: 'Export' })
  const play = page.getByRole('button', { name: 'Play' })

  await exportAction.click()
  const exportDialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await expect(exportDialog).toBeVisible()
  // The backdrop covers the top bar, so the click cannot reach the other action.
  await expect(transcribeAction.click({ timeout: 1000 })).rejects.toThrow()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(play).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await transcribeAction.click()
  const transcribeDialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(transcribeDialog).toBeVisible()
  await expect(exportAction.click({ timeout: 1000 })).rejects.toThrow()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(play).toBeVisible()
  await transcribeDialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(transcribeAction).toBeFocused()
})
