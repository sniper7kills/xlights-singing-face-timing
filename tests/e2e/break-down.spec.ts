import { expect, type Page, test } from '@playwright/test'

type Box = { left: number; right: number }

function layer(page: Page, name: 'Words' | 'Phonemes') {
  return page.getByRole('list', { name }).getByRole('listitem')
}

// MarkView places each mark with an inline left and width in pixels.
async function boxes(page: Page, name: 'Words' | 'Phonemes'): Promise<Box[]> {
  const styles = await layer(page, name).evaluateAll((items) =>
    items.map((item) => item.getAttribute('style') ?? ''),
  )
  return styles.map((style) => {
    const left = parseFloat(/left:\s*([\d.]+)px/.exec(style)?.[1] ?? 'NaN')
    const width = parseFloat(/width:\s*([\d.]+)px/.exec(style)?.[1] ?? 'NaN')
    return { left, right: left + width }
  })
}

// Each word has phonemes that start at the word start and end at the word end, with no gap.
async function expectPhonemesUnderEachWord(page: Page) {
  const words = await boxes(page, 'Words')
  const phonemes = await boxes(page, 'Phonemes')
  expect(words).toHaveLength(16)
  for (const word of words) {
    const inside = phonemes
      .filter((phoneme) => phoneme.left >= word.left - 0.5 && phoneme.right <= word.right + 0.5)
      .sort((a, b) => a.left - b.left)
    expect(inside.length).toBeGreaterThan(0)
    expect(inside[0]?.left).toBeCloseTo(word.left, 1)
    expect(inside.at(-1)?.right).toBeCloseTo(word.right, 1)
    for (let i = 1; i < inside.length; i++)
      expect(inside[i]?.left).toBeCloseTo(inside[i - 1]?.right ?? 0, 1)
  }
}

test('breaks down each word of a transcribe run, requests the dictionary one time, and keeps the phonemes after a reload', async ({
  page,
}) => {
  const dictionaryRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('dict/cmudict.json')) dictionaryRequests.push(request.url())
  })
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(layer(page, 'Phonemes')).toHaveCount(0)
  expect(dictionaryRequests).toEqual([])

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('button', { name: 'Start' }).click()
  // A wait after a transcribe run gets 20 seconds, so a loaded machine does not fail the test.
  await expect(dialog).toBeHidden({ timeout: 20_000 })

  await expect(page.getByText('16 words, 0 estimated')).toBeVisible({ timeout: 20_000 })
  await expect(layer(page, 'Words')).toHaveCount(16)
  await expect(layer(page, 'Phonemes').first()).toBeVisible()
  await expectPhonemesUnderEachWord(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(dictionaryRequests).toHaveLength(1)

  await expect(page.locator('.save-state')).toHaveText('Saved')
  const count = await layer(page, 'Phonemes').count()
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(layer(page, 'Phonemes')).toHaveCount(count)
  await expectPhonemesUnderEachWord(page)
})

test('writes the words without phonemes when the dictionary does not load, and breaks them down on "Retry"', async ({
  page,
}) => {
  let fail = true
  await page.route('**/dict/cmudict.json', (route) =>
    fail ? route.fulfill({ status: 503, body: '' }) : route.continue(),
  )
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('button', { name: 'Start' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(
    'The dictionary did not load. Check the connection and retry.',
    { timeout: 20_000 },
  )
  await expect(layer(page, 'Words')).toHaveCount(16)
  await expect(layer(page, 'Phonemes')).toHaveCount(0)

  fail = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(alert).toBeHidden()
  await expectPhonemesUnderEachWord(page)
})
