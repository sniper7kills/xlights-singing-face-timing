import { readFile } from 'node:fs/promises'
import { expect, test, type Download } from '@playwright/test'

// This test follows the quick start of docs/manual/README.md in one path.
// The fixture worker replaces the speech model, so no model downloads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: 'globalThis.__TRANSCRIBE_FIXTURE__ = true' })
})

async function textOf(download: Download): Promise<string> {
  return readFile(await download.path(), 'utf8')
}

test('follows the quick start from the demo song to two timing files', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const transcribe = page.getByRole('dialog', { name: 'Transcribe' })
  await transcribe.getByRole('button', { name: 'Start' }).click()
  // The demo song has marks, so the run asks before it replaces them.
  await transcribe.getByRole('button', { name: 'Continue' }).click()
  await expect(transcribe).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('status').filter({ hasText: /^16 words/ })).toBeVisible()

  const words = page.getByRole('list', { name: 'Words' }).getByRole('listitem')
  await words.first().dblclick()
  const field = page.getByRole('textbox', { name: 'Word label' })
  await field.fill('Gentle')
  await field.press('Enter')
  await expect(words.first()).toHaveText('Gentle')

  const rail = page.getByRole('complementary', { name: 'Voices' })
  await rail.getByRole('button', { name: 'Add voice' }).click()
  await expect(rail.getByRole('button', { name: 'Voice 2', exact: true })).toBeVisible()
  await page.getByRole('list', { name: 'Phrases' }).getByRole('listitem').last().click()
  await page.getByRole('button', { name: 'Phrase', exact: true }).click()
  await page.getByRole('menuitem', { name: /Move to voice/ }).click()
  await page.getByRole('menuitem', { name: 'Voice 2' }).click()
  await expect(
    rail.getByRole('button', { name: 'Voice 2', exact: true }),
  ).toHaveAccessibleDescription('1 phrase')

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await dialog.getByRole('radio', { name: 'One file for each timing track' }).check()
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await dialog.getByRole('button', { name: 'Download' }).click()
  await expect(dialog.getByRole('status')).toHaveText('2 timing tracks written to 2 files')

  await expect.poll(() => downloads.length).toBe(2)
  const names = downloads.map((download) => download.suggestedFilename()).sort()
  expect(names).toEqual(['Silent Night - Lead Vocals.xtiming', 'Silent Night - Voice 2.xtiming'])
  const files = await Promise.all(downloads.map(textOf))
  for (const file of files) {
    expect(file.match(/<EffectLayer>/g)).toHaveLength(3)
  }
  expect(files.some((file) => file.includes('label="Gentle"'))).toBe(true)
})
