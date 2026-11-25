import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture workers download no model. The transcribe fixture returns the 16 demo song words in 3 phrases.
// The separate fixture returns the mono mix. The singers fixture gives singer 0 the first half of the song
// and singer 1 the second half, with 500 ms in common at the middle. The phrase
// "All is calm all is bright" (9.8 s to 18.7 s) crosses the middle, so both singers sing it.
// The script also records each text of the progress area, because a polling assertion can miss a short state.
// The E2E tests compile with no DOM types, so the script is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  globalThis.__SINGERS_FIXTURE__ = true
  const log = []
  globalThis.__progressLog = log
  new MutationObserver(() => {
    const text = document.querySelector('.transcribe-progress')?.textContent ?? ''
    if (text !== '' && log.at(-1) !== text) log.push(text)
  }).observe(document, { subtree: true, childList: true, characterData: true })
`

const SEPARATE = 'Separate the vocals first'
const SINGERS = 'Put each singer on its own voice'
const SHARED_PHRASE = 'All is calm all is bright'

/** Returns the URL of each request for a file of the singers worker. */
function watchSingerRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/singers/i.test(new URL(request.url()).pathname)) urls.push(request.url())
  })
  return urls
}

async function progressLog(page: Page): Promise<string[]> {
  const log: unknown = await page.evaluate('globalThis.__progressLog')
  if (!Array.isArray(log)) throw new Error('The progress log is missing.')
  return log.filter((text): text is string => typeof text === 'string')
}

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

async function openDialog(page: Page): Promise<Locator> {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('checkbox', { name: SINGERS })).toBeVisible()
  return dialog
}

function rail(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Voices' })
}

function voiceButton(page: Page, name: string): Locator {
  return rail(page).getByRole('button', { name, exact: true })
}

function phrases(page: Page): Locator {
  return page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

test('a run with both options off requests no file of the singers worker', async ({ page }) => {
  const singerRequests = watchSingerRequests(page)
  await createSong(page)
  const dialog = await openDialog(page)
  await expect(dialog.getByRole('checkbox', { name: SEPARATE })).not.toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: SINGERS })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(rail(page).getByRole('listitem')).toHaveCount(1)
  expect(singerRequests).toEqual([])
  expect((await progressLog(page)).some((text) => text.includes('singer'))).toBe(false)
})

test('a run with both options on puts the second singer on "Singer 2", and one undo removes it', async ({
  page,
}) => {
  const singerRequests = watchSingerRequests(page)
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  await dialog.getByRole('checkbox', { name: SINGERS }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  // The run has three worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words on 2 voices, 0 estimated')).toBeVisible()
  expect(singerRequests.length).toBeGreaterThan(0)
  const log = await progressLog(page)
  expect(log).toContain('Downloading singer model, 50%')
  const finding = log.findIndex((text) => /^Finding the singers, \d:\d\d of 0:28$/.test(text))
  const transcribing = log.findIndex((text) => text.startsWith('Transcribing'))
  expect(finding).toBeGreaterThan(transcribing)

  await expect(rail(page).getByRole('listitem')).toHaveCount(2)
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAccessibleDescription('2 phrases')
  await expect(voiceButton(page, 'Singer 2')).toHaveAccessibleDescription('2 phrases')
  await expect(phrases(page).filter({ hasText: SHARED_PHRASE })).toHaveCount(1)
  await voiceButton(page, 'Singer 2').click()
  await expect(phrases(page)).toHaveCount(2)
  await expect(phrases(page).filter({ hasText: SHARED_PHRASE })).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+z')

  await expect(rail(page).getByRole('listitem')).toHaveCount(1)
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAccessibleDescription('3 phrases')
  await expect(phrases(page)).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Words' }).getByRole('listitem')).toHaveCount(16)
})
