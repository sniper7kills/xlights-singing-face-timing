import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, type Route, test } from '@playwright/test'

// These tests never call a real endpoint. `page.route` answers each request to the fake host.
const APP_ORIGIN = 'http://localhost:4173'
const BASE_URL = 'https://whisper.test/v1'
const ENDPOINT_URL = `${BASE_URL}/audio/transcriptions`
const KEY = 'sk-e2e-secret'

type MarksFile = { marks: { layer: string; label: string; startMs: number; endMs: number }[] }

/** The demo song words as a `verbose_json` response, in seconds. The fixture worker returns the same words. */
function verboseJson(): string {
  const file = JSON.parse(readFileSync('public/demo/silent-night.marks.json', 'utf8')) as MarksFile
  const words = file.marks
    .filter((mark) => mark.layer === 'word')
    .map((mark) => ({ word: ` ${mark.label}`, start: mark.startMs / 1000, end: mark.endMs / 1000 }))
  return JSON.stringify({ text: words.map((word) => word.word).join(''), words })
}

const CORS = {
  'access-control-allow-origin': APP_ORIGIN,
  'access-control-allow-headers': 'authorization',
  'access-control-allow-methods': 'POST',
}

/** Answers the CORS preflight, and answers the POST with `answer`. */
async function fakeEndpoint(page: Page, answer: (route: Route) => Promise<void>) {
  await page.route(ENDPOINT_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') await route.fulfill({ status: 204, headers: CORS })
    else await answer(route)
  })
}

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

async function openDialog(page: Page): Promise<Locator> {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('radio', { name: 'In this browser' })).toBeVisible()
  return dialog
}

async function saveEndpoint(dialog: Locator, apiKey = '') {
  await dialog.getByRole('radio', { name: 'Remote endpoint' }).check()
  await dialog.getByLabel('Base URL').fill(BASE_URL)
  await dialog.getByLabel('API key (optional)').fill(apiKey)
  await dialog.getByRole('button', { name: 'Save endpoint' }).click()
  await expect(
    dialog.getByText(
      'The app sends the audio of this song to whisper.test. The audio leaves this computer.',
    ),
  ).toBeVisible()
}

/** Returns the label, start and end of each mark of a layer, from the layer list in the editor. */
function layerMarks(page: Page, name: 'Phrases' | 'Words' | 'Phonemes') {
  return page
    .getByRole('list', { name })
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => `${item.getAttribute('title')} ${item.getAttribute('style')}`),
    )
}

async function allLayers(page: Page) {
  return {
    phrases: await layerMarks(page, 'Phrases'),
    words: await layerMarks(page, 'Words'),
    phonemes: await layerMarks(page, 'Phonemes'),
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
})

test('a remote run creates the same marks on three layers as a browser run of the same words', async ({
  page,
}) => {
  const posts: { headers: Record<string, string>; url: string }[] = []
  await fakeEndpoint(page, async (route) => {
    posts.push({ headers: route.request().headers(), url: route.request().url() })
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: verboseJson(),
    })
  })
  await createSong(page)

  // A busy test computer can take more than 5 seconds for a run and the write of its marks.
  const browser = await openDialog(page)
  await browser.getByRole('button', { name: 'Start' }).click()
  await expect(browser).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => (await layerMarks(page, 'Phonemes')).length, { timeout: 20_000 })
    .toBeGreaterThan(16)
  const browserMarks = await allLayers(page)
  expect(browserMarks.words).toHaveLength(16)

  const remote = await openDialog(page)
  await saveEndpoint(remote)
  await remote.getByRole('button', { name: 'Start' }).click()
  await expect(remote.getByText('The run replaces the marks of this voice.')).toBeVisible({
    timeout: 20_000,
  })
  await remote.getByRole('button', { name: 'Continue' }).click()
  await expect(remote).toBeHidden({ timeout: 20_000 })

  await expect(page.getByText('16 words, 0 estimated')).toBeVisible({ timeout: 20_000 })

  // The editor can draw the layers after the dialog closes, so the test reads them until they match.
  await expect.poll(() => allLayers(page), { timeout: 20_000 }).toEqual(browserMarks)
  // `require-corp` (ADR 0006) lets a CORS request to another host through.
  expect(await page.evaluate('crossOriginIsolated')).toBe(true)
  expect(posts).toHaveLength(1)
  expect(posts[0]?.url).toBe(ENDPOINT_URL)
  expect(posts[0]?.headers.authorization).toBeUndefined()
})

test('a run "In this browser" sends no request outside the app, with an endpoint stored', async ({
  page,
}) => {
  const outside: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(APP_ORIGIN) && !request.url().startsWith('blob:'))
      outside.push(request.url())
  })
  await fakeEndpoint(page, (route) => route.abort())
  await createSong(page)

  const dialog = await openDialog(page)
  await saveEndpoint(dialog, KEY)
  await dialog.getByRole('radio', { name: 'In this browser' }).check()
  await expect(dialog.getByText(/leaves this computer/)).toBeHidden()
  await dialog.getByLabel('Lyrics (optional)').fill('Silent night, holy night')
  await dialog.getByRole('button', { name: 'Start' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('list', { name: 'Words' }).getByRole('listitem')).not.toHaveCount(0)
  expect(outside).toEqual([])
})

test('a remote run that the endpoint refuses with 401 shows the API key message and creates no mark', async ({
  page,
}) => {
  let authorization: string | undefined
  await fakeEndpoint(page, async (route) => {
    authorization = route.request().headers().authorization
    await route.fulfill({
      status: 401,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
    })
  })
  await createSong(page)

  const dialog = await openDialog(page)
  await saveEndpoint(dialog, KEY)
  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(
    dialog.getByText(
      'whisper.test refused the API key (HTTP 401). Check the API key of the remote endpoint.',
    ),
  ).toBeVisible()
  expect(authorization).toBe(`Bearer ${KEY}`)
  await expect(dialog).not.toContainText(KEY)
  await expect(page.getByRole('list', { name: 'Words' }).getByRole('listitem')).toHaveCount(0)
})
