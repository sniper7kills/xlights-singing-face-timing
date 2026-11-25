import { expect, type Page, test } from '@playwright/test'
import { reportToText, type RunReport } from '../../src/lib/runReport/runReport.ts'

// The fixture workers download no model. The transcribe fixture returns the 16 demo song words in 3 phrases.
// The singers fixture gives two singers and diagnostics with three raw groups.
// The E2E tests compile with no DOM types, so each script in the page is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  globalThis.__SINGERS_FIXTURE__ = true
`

/** Reads all records of the `runs` object store in the page. */
const READ_RUNS = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const database = open.result
    const request = database.transaction('runs', 'readonly').objectStore('runs').getAll()
    request.onsuccess = () => {
      database.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  }
})`

// Words of the demo song lyrics. No report may hold one of them.
const LYRIC_WORDS = ['Silent', 'holy', 'calm', 'bright', 'virgin', 'Sleep']

type StoredRun = { songId: string; singerSegments: unknown[]; report: RunReport }

async function storedRuns(page: Page): Promise<StoredRun[]> {
  const runs: unknown = await page.evaluate(READ_RUNS)
  if (!Array.isArray(runs)) throw new Error('The runs object store gave no list.')
  return runs as StoredRun[]
}

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

async function transcribe(page: Page, options: string[]) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  for (const name of options) await dialog.getByRole('checkbox', { name }).check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has three worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

test('a run with separation and singer voices keeps a report with the singer section after a reload', async ({
  page,
}) => {
  await createSong(page)
  await transcribe(page, [
    'Separate the vocals first',
    'Put each singer on its own voice (experimental)',
  ])
  await expect(page.getByText('16 words on 2 voices, 0 estimated')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  const runs = await storedRuns(page)
  expect(runs).toHaveLength(1)
  const [run] = runs
  expect(run?.singerSegments).toHaveLength(2)
  const report = run?.report
  expect(report).toMatchObject({
    source: 'browser',
    mode: 'model',
    separationModel: 'spleeter',
    wordCount: 16,
    phraseCount: 3,
  })
  expect(report?.singers).toMatchObject({
    status: 'split',
    rangeCount: 2,
    shareThreshold: 0.3,
    singersWithPhrases: 2,
    phrasesWithMoreSingers: 1,
    voicesMade: 2,
  })
  expect(report?.singers.diagnostics).toMatchObject({ rawGroupCount: 3, finalSingerCount: 2 })
  expect(report?.voices.map((voice) => voice.name)).toEqual(['Lead Vocals', 'Singer 2'])

  const text = report === undefined ? '' : reportToText(report)
  expect(text).toContain('[Singers]\nStep: split\n')
  const stored = JSON.stringify(run)
  for (const word of LYRIC_WORDS) {
    expect(text).not.toContain(word)
    expect(stored).not.toContain(word)
  }
})

test('deleting the song removes its run report', async ({ page }) => {
  await createSong(page)
  await transcribe(page, [])
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect.poll(async () => (await storedRuns(page)).length).toBe(1)

  await page.goto('/')
  await page.getByRole('button', { name: 'Delete silent-night' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('button', { name: 'Delete silent-night' })).toBeHidden()
  expect(await storedRuns(page)).toEqual([])
})
