import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture workers download no model. The transcribe fixture returns the 16 demo song words in 3 phrases.
// The separate fixture returns the mono mix. The singers fixture gives singer 0 the first half of the song
// and singer 1 the second half, with 500 ms in common at the middle. The phrase
// "All is calm all is bright" (9.8 s to 18.7 s) crosses the middle: singer 0 sings "All is calm",
// and singer 1 sings "all is bright" from 14.3 s. So the singer step divides the phrase there.
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
const SINGERS = 'Put each singer on its own voice (experimental)'
const SHARED_PHRASE = 'All is calm all is bright'
const FIRST_PART = 'All is calm'
const SECOND_PART = 'all is bright'
const APP_ORIGIN = 'http://localhost:4173'

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

test('a run with both options on divides the phrase where the singer changes, puts singer 2 on "Singer 2", and one undo removes it', async ({
  page,
}) => {
  const singerRequests = watchSingerRequests(page)
  const outside: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(APP_ORIGIN) && !request.url().startsWith('blob:'))
      outside.push(request.url())
  })
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  await dialog.getByRole('checkbox', { name: SINGERS }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  // The run has three worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words on 2 voices, 0 estimated')).toBeVisible()
  expect(singerRequests.length).toBeGreaterThan(0)
  // The singer step sends no audio: the run makes no request outside the app.
  expect(outside).toEqual([])
  const log = await progressLog(page)
  expect(log).toContain('Downloading singer model, 50%')
  const finding = log.findIndex((text) => /^Finding the singers, \d:\d\d of 0:28$/.test(text))
  const transcribing = log.findIndex((text) => text.startsWith('Transcribing'))
  expect(finding).toBeGreaterThan(transcribing)

  await expect(rail(page).getByRole('listitem')).toHaveCount(2)
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAccessibleDescription('2 phrases')
  await expect(voiceButton(page, 'Singer 2')).toHaveAccessibleDescription('2 phrases')
  await expect(phrases(page).filter({ hasText: FIRST_PART })).toHaveCount(1)
  await expect(phrases(page).filter({ hasText: SHARED_PHRASE })).toHaveCount(0)
  await voiceButton(page, 'Singer 2').click()
  await expect(phrases(page)).toHaveCount(2)
  await expect(phrases(page).filter({ hasText: SECOND_PART })).toHaveCount(1)
  await expect(phrases(page).filter({ hasText: FIRST_PART })).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')

  await expect(rail(page).getByRole('listitem')).toHaveCount(1)
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAccessibleDescription('3 phrases')
  await expect(phrases(page)).toHaveCount(3)
  await expect(phrases(page).filter({ hasText: SHARED_PHRASE })).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Words' }).getByRole('listitem')).toHaveCount(16)
})

test('a run with the count 3 in "Singers" makes three voices, and the next dialog keeps the count', async ({
  page,
}) => {
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  await dialog.getByRole('checkbox', { name: SINGERS }).check()
  const singers = dialog.getByRole('group', { name: 'Singers' })
  await expect(singers.getByRole('radio', { name: 'Automatic' })).toBeChecked()

  await singers.getByRole('radio', { name: '3' }).check()
  await dialog.getByRole('button', { name: 'Start' }).click()

  // The fixture worker gives each of the 3 singers one third of the song, so each phrase has its own singer.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words on 3 voices, 0 estimated')).toBeVisible()
  await expect(rail(page).getByRole('listitem')).toHaveCount(3)
  await expect(voiceButton(page, 'Singer 3')).toHaveAccessibleDescription('1 phrase')

  const next = await openDialog(page)
  await expect(
    next.getByRole('group', { name: 'Singers' }).getByRole('radio', { name: '3' }),
  ).toBeChecked()
})

/** Returns the text of each body row of the table, as a list of cells. */
async function tableRows(table: Locator): Promise<string[][]> {
  const rows = table.locator('tbody tr')
  const result: string[][] = []
  for (let index = 0; index < (await rows.count()); index += 1)
    result.push(await rows.nth(index).locator('td, th').allInnerTexts())
  return result
}

/**
 * Runs a transcribe run with both options on and the singer count.
 * With `replaces`, the run asks the replace question first: the function returns its text and selects "Continue".
 */
async function runWithSingers(page: Page, count: string, replaces = false): Promise<string> {
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  await dialog.getByRole('checkbox', { name: SINGERS }).check()
  await dialog.getByRole('group', { name: 'Singers' }).getByRole('radio', { name: count }).check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  let text = ''
  if (replaces) {
    const question = dialog.locator('.dialog-confirm')
    await expect(question).toBeVisible()
    text = (await question.textContent()) ?? ''
    await dialog.getByRole('button', { name: 'Continue' }).click()
  }
  // The run has three worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  // The next run reads the stored run data, and the write of the run data can end after the dialog closes.
  await expect(
    page.locator('.editor-top').getByRole('button', { name: 'Run report' }),
  ).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 })
  return text
}

test('two runs with "Singers" 2 and then 4 give four voices that agree with the rows and the run report', async ({
  page,
}) => {
  await createSong(page)
  await runWithSingers(page, '2')
  await expect(rail(page).getByRole('listitem')).toHaveCount(2)

  const question = await runWithSingers(page, '4', true)

  expect(question).toMatch(
    /^The run replaces \d+ marks from 0:00\.000 to 0:28\.\d{3}: the marks of "Lead Vocals", and the marks of "Singer 2" from the last run\.$/,
  )
  const names = ['Lead Vocals', 'Singer 2', 'Singer 3', 'Singer 4']
  await expect(rail(page).getByRole('listitem')).toHaveCount(4)
  for (const name of names) await expect(voiceButton(page, name)).toBeVisible()
  const group = page.getByRole('group', { name: 'Audio tracks' })
  await expect(group.locator('.track-row[data-row^="singer:"]')).toHaveCount(4, { timeout: 20_000 })
  for (const name of names)
    await expect(group.getByRole('button', { name: `Mute ${name}`, exact: true })).toBeVisible()

  await page.locator('.editor-top').getByRole('button', { name: 'Run report' }).click()
  const panel = page.getByRole('dialog', { name: 'Run report' })
  const voices = panel.getByRole('table', { name: 'The voices that hold phrases of the run' })
  await expect(voices).toBeVisible()
  expect((await tableRows(voices)).map((row) => row[0])).toEqual(names)
})

test('a run with the singer option off states that the singer voices of the last run do not change', async ({
  page,
}) => {
  await createSong(page)
  await runWithSingers(page, '2')
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SINGERS }).uncheck()

  await dialog.getByRole('button', { name: 'Start' }).click()

  // The question follows a read of the run data, which is slow on a busy test computer.
  await expect(dialog.locator('.dialog-confirm')).toHaveText(
    /^The run replaces the \d+ marks of "Lead Vocals" from 0:00\.000 to 0:28\.\d{3}\. The voices of the last singer step do not change\.$/,
    { timeout: 20_000 },
  )
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(rail(page).getByRole('listitem')).toHaveCount(2)
})
