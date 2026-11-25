import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture workers download no model: the transcribe fixture returns the demo song words,
// and the separate fixture returns the mono mix after about one second of progress.
// The script also records each text of the progress area, because a polling assertion can miss a short state.
// The E2E tests compile with no DOM types, so the script is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  const log = []
  globalThis.__progressLog = log
  new MutationObserver(() => {
    const text = document.querySelector('.transcribe-progress')?.textContent ?? ''
    if (text !== '' && log.at(-1) !== text) log.push(text)
  }).observe(document, { subtree: true, childList: true, characterData: true })
`

const APP_ORIGIN = 'http://localhost:4173'
const BASE_URL = 'https://whisper.test/v1'
const ENDPOINT_URL = `${BASE_URL}/audio/transcriptions`
const CORS = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-headers': 'authorization',
  'access-control-allow-methods': 'POST',
}
const CHECK_BOX = 'Separate the vocals first'

type MarksFile = { marks: { layer: string; label: string; startMs: number; endMs: number }[] }

/** The demo song words as a `verbose_json` response, in seconds. */
function verboseJson(): string {
  const file = JSON.parse(readFileSync('public/demo/silent-night.marks.json', 'utf8')) as MarksFile
  const words = file.marks
    .filter((mark) => mark.layer === 'word')
    .map((mark) => ({ word: ` ${mark.label}`, start: mark.startMs / 1000, end: mark.endMs / 1000 }))
  return JSON.stringify({ text: words.map((word) => word.word).join(''), words })
}

/** Returns the URL of each request for a file of the separate worker, in the order of the requests. */
function watchSeparateRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/separate/i.test(new URL(request.url()).pathname)) urls.push(request.url())
  })
  return urls
}

async function progressLog(page: Page): Promise<string[]> {
  const log: unknown = await page.evaluate('globalThis.__progressLog')
  if (!Array.isArray(log)) throw new Error('The progress log is missing.')
  return log.filter((text): text is string => typeof text === 'string')
}

async function openDialog(page: Page): Promise<Locator> {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('checkbox', { name: CHECK_BOX })).toBeVisible()
  return dialog
}

function words(page: Page): Locator {
  return page.getByRole('list', { name: 'Words' }).getByRole('listitem')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

test('a run with the option off makes marks and requests no file of the separate worker', async ({
  page,
}) => {
  const separateRequests = watchSeparateRequests(page)
  await createSong(page)
  const dialog = await openDialog(page)
  await expect(dialog.getByRole('checkbox', { name: CHECK_BOX })).not.toBeChecked()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(words(page)).toHaveCount(16)
  expect(separateRequests).toEqual([])
  expect((await progressLog(page)).some((text) => text.includes('vocal'))).toBe(false)
})

test('a run with the option on shows "Separating vocals" and then makes marks', async ({
  page,
}) => {
  const separateRequests = watchSeparateRequests(page)
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: CHECK_BOX }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog.getByText(/^Separating vocals, /)).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(words(page)).toHaveCount(16)
  expect(separateRequests.length).toBeGreaterThan(0)
  const log = await progressLog(page)
  const separating = log.findIndex((text) => /^Separating vocals, \d:\d\d of 0:28, /.test(text))
  const transcribing = log.findIndex((text) => text.startsWith('Transcribing'))
  expect(log).toContain('Downloading vocal separation model, 50%')
  expect(separating).toBeGreaterThan(-1)
  expect(transcribing).toBeGreaterThan(separating)
})

test('a remote run with the option on sends one upload after the separation step', async ({
  page,
}) => {
  const events: string[] = []
  page.on('request', (request) => {
    if (/separate/i.test(new URL(request.url()).pathname)) events.push('separate worker')
  })
  await page.route(ENDPOINT_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    events.push('upload')
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: verboseJson(),
    })
  })
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: 'Remote endpoint' }).check()
  await dialog.getByLabel('Base URL').fill(BASE_URL)
  await dialog.getByRole('button', { name: 'Save endpoint' }).click()
  await expect(
    dialog.getByText(
      'The app separates the vocals in this browser, and then sends the vocals to whisper.test.',
      { exact: false },
    ),
  ).toBeVisible()
  await dialog.getByRole('checkbox', { name: CHECK_BOX }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  expect(events.filter((event) => event === 'upload')).toHaveLength(1)
  expect(events.indexOf('upload')).toBeGreaterThan(events.indexOf('separate worker'))
  expect(events.indexOf('separate worker')).toBeGreaterThan(-1)
  const log = await progressLog(page)
  const separating = log.findIndex((text) => text.startsWith('Separating vocals'))
  const sending = log.findIndex((text) => text.startsWith('Sending audio to whisper.test'))
  expect(separating).toBeGreaterThan(-1)
  expect(sending).toBeGreaterThan(separating)
})
