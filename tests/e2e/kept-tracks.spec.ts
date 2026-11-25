import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

// The fixture workers download no model. The separate fixture gives the mono mix as the vocals,
// and the mono mix at half level with the sign inverted as the instruments.
// The E2E tests compile with no DOM types, so each script in the page is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
`

/** Reads the song length and a summary of each record of the `runs` object store in the page. */
const READ_RUNS = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const database = open.result
    const transaction = database.transaction(['runs', 'songs'], 'readonly')
    const runs = transaction.objectStore('runs').getAll()
    const songs = transaction.objectStore('songs').getAll()
    transaction.oncomplete = () => {
      database.close()
      const track = (value) => value === undefined ? null : {
        startMs: value.startMs,
        sampleRate: value.sampleRate,
        length: value.samples.length,
        bytes: value.samples.BYTES_PER_ELEMENT,
        first: value.samples.find((sample) => sample !== 0) ?? 0,
      }
      resolve({
        durationMs: songs.result.map((song) => song.durationMs),
        runs: runs.result.map((run) => ({
          report: { trackCount: run.report.trackCount, tracksKept: run.report.tracksKept },
          vocals: track(run.tracks?.vocals),
          instruments: track(run.tracks?.instruments),
        })),
      })
    }
    transaction.onerror = () => reject(transaction.error)
  }
})`

type TrackSummary = {
  startMs: number
  sampleRate: number
  length: number
  bytes: number
  first: number
}
type RunSummary = {
  report: { trackCount?: number; tracksKept?: boolean }
  vocals: TrackSummary | null
  instruments: TrackSummary | null
}
type Stored = { durationMs: number[]; runs: RunSummary[] }

async function stored(page: Page): Promise<Stored> {
  return (await page.evaluate(READ_RUNS)) as Stored
}

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

/** Runs the transcribe dialog with "Separate the vocals first", and with "Keep the separated tracks" set to `keep`. */
async function transcribeSeparated(page: Page, keep: boolean) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('checkbox', { name: 'Separate the vocals first' }).check()
  const keepBox = dialog.getByRole('checkbox', { name: 'Keep the separated tracks' })
  await expect(keepBox).toBeChecked()
  await expect(dialog.getByText(/^The app stores the vocals and the instruments/)).toBeVisible()
  await keepBox.setChecked(keep)
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has two worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

test('a run with separation keeps the vocals and the instruments after a reload', async ({
  page,
}) => {
  await createSong(page)
  await transcribeSeparated(page, true)

  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  const { durationMs, runs } = await stored(page)
  expect(runs).toHaveLength(1)
  const [run] = runs
  if (run?.vocals == null || run.instruments === null) throw new Error('The run kept no tracks.')
  expect(run.report).toEqual({ trackCount: 2, tracksKept: true })
  const expected = (Number(durationMs[0]) / 1000) * 22_050
  for (const track of [run.vocals, run.instruments]) {
    expect(track).toMatchObject({ startMs: 0, sampleRate: 22_050, bytes: 2 })
    expect(Math.abs(track.length - expected)).toBeLessThan(22_050 * 0.05)
  }
  expect(run.instruments.length).toBe(run.vocals.length)
  // The fixture inverts the sign for the instruments, so the two tracks differ.
  expect(Math.sign(run.vocals.first)).toBe(-Math.sign(run.instruments.first))
})

test('a run with "Keep the separated tracks" off keeps no tracks', async ({ page }) => {
  await createSong(page)
  await transcribeSeparated(page, false)

  await expect.poll(async () => (await stored(page)).runs.length).toBe(1)
  const [run] = (await stored(page)).runs
  expect(run).toEqual({
    report: { trackCount: 2, tracksKept: false },
    vocals: null,
    instruments: null,
  })
})

test('deleting the song removes its tracks', async ({ page }) => {
  await createSong(page)
  await transcribeSeparated(page, true)
  await expect.poll(async () => (await stored(page)).runs.length).toBe(1)

  await page.goto('/')
  await page.getByRole('button', { name: 'Delete silent-night' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('button', { name: 'Delete silent-night' })).toBeHidden()
  expect((await stored(page)).runs).toEqual([])
})

test('the zip file holds the two tracks and the run report after a run with separation', async ({
  page,
}) => {
  await createSong(page)
  await transcribeSeparated(page, true)

  await page.locator('.editor-top').getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await dialog.getByRole('checkbox', { name: 'Everything as one zip file' }).check()
  await expect(
    dialog.getByText(
      /^The zip file holds 8 files: .*tracks\/vocals\.wav, tracks\/instruments\.wav, report\.txt, README\.txt\. Size: [\d.]+ MB\.$/,
    ),
  ).toBeVisible()
  const zipEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download zip' }).click()
  const zip = await readFile(await (await zipEvent).path())

  const text = zip.toString('latin1')
  for (const name of ['tracks/vocals.wav', 'tracks/instruments.wav', 'report.txt'])
    expect(text).toContain(name)
  expect(text).toContain('RIFF')
  expect(text).toContain('[Vocal separation]')
  expect(text).toContain('Audio tracks: 2')
  expect(text).toContain('- tracks/vocals.wav: The vocals of the last vocal separation')
})
