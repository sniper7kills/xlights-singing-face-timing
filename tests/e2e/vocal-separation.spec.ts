import { readdirSync, readFileSync } from 'node:fs'
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
  const outside: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(APP_ORIGIN) && !request.url().startsWith('blob:'))
      outside.push(request.url())
  })
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: CHECK_BOX }).check()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog.getByText(/^Separating vocals, /)).toBeVisible()
  // The run also converts and stores the two kept audio tracks, so it can take more than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(words(page)).toHaveCount(16)
  expect(separateRequests.length).toBeGreaterThan(0)
  // The separation sends no audio: the run makes no request outside the app.
  expect(outside).toEqual([])
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

  await expect(dialog).toBeHidden({ timeout: 20_000 })
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

const FAST = 'Fast (Spleeter, 79 MB)'
// Reads `separationModel` of the settings record. The E2E tests compile with no DOM types, so the script is a string.
const STORED_SEPARATION_MODEL = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const read = open.result.transaction('settings').objectStore('settings').get('app')
    read.onerror = () => reject(read.error)
    read.onsuccess = () => {
      open.result.close()
      resolve(read.result?.separationModel ?? null)
    }
  }
})`
const DEMUCS = 'Demucs, experimental (181 MB, much slower)'

/** Returns the contents of each built file in `dist/assets` whose name starts with the prefix. The web server builds `dist` before the tests. */
function builtChunks(prefix: string): string[] {
  return readdirSync('dist/assets')
    .filter((name) => name.startsWith(prefix) && name.endsWith('.js'))
    .map((name) => readFileSync(`dist/assets/${name}`, 'utf8'))
}

test('a run with the fast model requests no file of the Demucs engine', async ({ page }) => {
  const demucsRequests: string[] = []
  page.on('request', (request) => {
    if (/demucs/i.test(new URL(request.url()).pathname)) demucsRequests.push(request.url())
  })
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: CHECK_BOX }).check()
  await expect(dialog.getByRole('radio', { name: FAST })).toBeChecked()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  expect(demucsRequests).toEqual([])
})

test('the build keeps the Demucs engine out of the separate worker and the page', () => {
  const [demucs] = builtChunks('demucsSeparator-')
  // `TRAINING_SAMPLES` is a constant of the `demucs-web` package.
  expect(demucs).toContain('TRAINING_SAMPLES')
  for (const chunk of [...builtChunks('separate.worker-'), ...builtChunks('index-')]) {
    expect(chunk).not.toContain('TRAINING_SAMPLES')
  }
  expect(builtChunks('separate.worker-').join('')).toMatch(/import\(`?["'`]?\.\/demucsSeparator-/)
})

test('the dialog keeps the separation model after a reload', async ({ page }) => {
  await createSong(page)
  let dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: CHECK_BOX }).check()
  await expect(dialog.getByRole('group', { name: 'Separation model' })).toBeVisible()
  await dialog.getByRole('radio', { name: DEMUCS }).check()
  await expect(
    dialog.getByText('downloads a model of 181 MB one time', { exact: false }),
  ).toBeVisible()

  // The dialog writes the choice to IndexedDB after the click, so the reload waits for the write.
  await expect.poll(() => page.evaluate(STORED_SEPARATION_MODEL)).toBe('demucs')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  dialog = await openDialog(page)

  await expect(dialog.getByRole('checkbox', { name: CHECK_BOX })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: DEMUCS })).toBeChecked()
})
