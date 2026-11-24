import { expect, test } from '@playwright/test'

test('opens the export dialog of the demo song with one timing track and a file preview', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()

  await page.getByRole('button', { name: 'Export' }).click()

  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Frame size: 50 ms')).toBeVisible()
  const names = dialog.getByRole('textbox', { name: /^Timing track name/ })
  await expect(names).toHaveCount(1)
  await expect(names).toHaveValue('Lead Vocals')
  const preview = dialog.getByLabel('File preview')
  const text = (await preview.textContent()) ?? ''
  expect(text.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
  expect(text).toContain('<timing name="Lead Vocals"')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export' })).toBeFocused()
})
