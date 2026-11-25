import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture worker returns the 16 words of public/demo/silent-night.marks.json and downloads no model.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
})

async function openDialog(page: Page): Promise<Locator> {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeEnabled()
  return dialog
}

test('refuses lyrics of 20 001 characters and returns control at once after a paste of 1 000 000', async ({
  page,
}) => {
  const dialog = await openDialog(page)
  const lyrics = dialog.getByLabel('Lyrics (optional)')

  await lyrics.fill('a'.repeat(20_001))

  await expect(
    dialog.getByText('The lyrics are too long. Use 20 000 characters at most.'),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled()

  // The E2E tests compile with no DOM types, so the script is a string.
  // A busy test computer can stall one paste, so the test keeps the fastest of three pastes.
  // A slow check of the lyrics makes every paste slow, so the fastest paste still shows it.
  const elapsedMs: unknown = await page.evaluate(`(async () => {
    const field = document.querySelector('.transcribe-dialog textarea')
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    const times = []
    for (const line of ['Silent night, holy night', 'All is calm, all is bright', 'Round yon virgin']) {
      const start = performance.now()
      setValue.call(field, (line + '\\n').repeat(40000))
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      times.push(performance.now() - start)
    }
    return Math.min(...times)
  })()`)
  expect(typeof elapsedMs === 'number' && elapsedMs < 1000).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled()
})

test('asks before lyrics that do not fit, with the three numbers, and states the words left out', async ({
  page,
}) => {
  const dialog = await openDialog(page)
  await expect(
    dialog.getByText(
      'The app uses each word that has a letter or a digit. It leaves out other words, such as & or an emoji.',
    ),
  ).toBeVisible()
  const lines = Array.from({ length: 200 }, (_, i) => `Line number ${i + 1} sings a little song`)
  await dialog.getByLabel('Lyrics (optional)').fill(lines.join('\n'))
  await dialog.getByRole('checkbox', { name: 'Lyrics only' }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  const question = dialog.getByText(
    /^The lyrics have 1400 words\. This song has room for about \d+ words\. The app leaves out the lines after line \d+\.$/,
  )
  await expect(question).toBeVisible()
  const [, room, kept] =
    /about (\d+) words.+line (\d+)\./.exec((await question.textContent()) ?? '') ?? []
  expect(Number(kept)).toBe(Math.floor(Number(room) / 7))
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(
    page.getByText(`${Number(kept) * 7} words, ${Number(kept) * 7} estimated`),
  ).toBeVisible()

  const again = await openDialog(page)
  await again.getByLabel('Lyrics (optional)').fill('Café "naïve" — <b>bold</b> & 你好 😀 \'tis')
  await again.getByRole('checkbox', { name: 'Lyrics only' }).check()
  await again.getByRole('button', { name: 'Start' }).click()
  await again.getByRole('button', { name: 'Continue' }).click()
  await expect(again).toBeHidden({ timeout: 20_000 })
  await expect(
    page.getByText('5 words, 5 estimated. The app left out 3 words that it cannot use.'),
  ).toBeVisible()
})

test('states why "Lyrics only" disables the source groups and hides the device note', async ({
  page,
}) => {
  const dialog = await openDialog(page)
  await expect(dialog.getByText(/WebGPU/)).toBeVisible()

  await dialog.getByRole('checkbox', { name: 'Lyrics only' }).check()

  await expect(dialog.getByText('Lyrics only uses no speech model.')).toBeVisible()
  await expect(dialog.getByText(/WebGPU/)).toBeHidden()
})

test('states the voice, the range and the count of the replace question, and what a cancel did', async ({
  page,
}) => {
  const first = await openDialog(page)
  await first.getByRole('button', { name: 'Start' }).click()
  await expect(first).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible({ timeout: 20_000 })

  const dialog = await openDialog(page)
  await dialog.getByRole('button', { name: 'Start' }).click()

  const question = dialog.getByText(
    /^The run replaces the \d+ marks of "Lead Vocals" from 0:00\.000 to 0:28\.\d{3}\.$/,
  )
  await expect(question).toBeVisible()
  const count = Number(/the (\d+) marks/.exec((await question.textContent()) ?? '')?.[1])
  // 3 phrases and 16 words, each word with one phoneme or more.
  expect(count).toBeGreaterThan(16 + 3 + 16 - 1)
  await expect(dialog.locator('.dialog-progress progress')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await expect(dialog.getByText('The run stopped. The marks did not change.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeVisible()
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`shows "Start" in full at ${viewport.width}x${viewport.height} with each option on`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const dialog = await openDialog(page)
    await dialog.getByLabel('Lyrics (optional)').fill('[Verse]\nSilent night\nHoly night')
    await dialog.getByRole('checkbox', { name: 'Separate the vocals first' }).check()
    await dialog.getByRole('radio', { name: /^Demucs/ }).check()
    await dialog.getByRole('checkbox', { name: /Put each singer on its own voice/ }).check()
    const start = dialog.getByRole('button', { name: 'Start' })

    await expect(start).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 })

    // The endpoint form is the longest form of the dialog.
    await dialog.getByRole('radio', { name: 'Remote endpoint' }).check()
    await expect(dialog.getByLabel('Base URL')).toBeVisible()
    await expect(start).toBeInViewport({ ratio: 1 })
  })
}
