import { expect, type Page, test } from '@playwright/test'

// The fixture worker holds each step for 50 ms only, so a polling assertion can miss a state.
// The script records each text of the progress area when the DOM changes.
// The E2E tests compile with no DOM types, so the script is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  const log = []
  globalThis.__progressLog = log
  new MutationObserver(() => {
    const text = document.querySelector('.transcribe-progress')?.textContent ?? ''
    if (text !== '' && log.at(-1) !== text) log.push(text)
  }).observe(document, { subtree: true, childList: true, characterData: true })
`

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
})

async function runAndExpectClose(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'base 139 MB' })).toBeChecked()
  await expect(dialog.getByText(/WebGPU/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden()
  const log: unknown = await page.evaluate('globalThis.__progressLog')
  if (!Array.isArray(log)) throw new Error('The progress log is missing.')
  expect(log).toContain('Downloading speech model, 50%')
  expect(
    log.some((text) => typeof text === 'string' && /^Transcribing, \d:\d\d of 0:28$/.test(text)),
  ).toBe(true)
}

test('runs a transcription from the "Transcribe" action of the top bar', async ({ page }) => {
  const action = page.locator('.editor-top').getByRole('button', { name: 'Transcribe' })

  await action.click()
  await runAndExpectClose(page)

  await expect(action).toBeFocused()
})

test('runs a transcription from the empty state of the layers', async ({ page }) => {
  const layers = page.getByRole('region', { name: 'Layers' })

  await layers.getByRole('button', { name: 'Transcribe' }).click()

  await runAndExpectClose(page)
})

test('closes the dialog for Escape and keeps the play state for the space bar', async ({
  page,
}) => {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press(' ')
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(dialog).toBeHidden()
})
