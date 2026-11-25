import { expect, type Page, test } from '@playwright/test'

// The fixture workers download no model. The separate fixture gives the mono mix as the vocals.
// The singers fixture gives each singer an equal part of the song. It runs only with the singer option on.
// The E2E tests compile with no DOM types, so each script in the page is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  globalThis.__SINGERS_FIXTURE__ = true
`

/** The bound for 90% of the samples: two times the drift limit of `src/lib/audio/trackMix.ts` (50 ms). */
const P90_LIMIT_MS = 100
/**
 * The bound for one sample. A busy test computer can stop the main thread for longer than one check of the mixer.
 * Then one sample can show more drift before the mixer moves the vocals again.
 */
const STALL_LIMIT_MS = 250

/** Returns the value under which `share` (0 to 1) of the values lie, by the nearest rank. */
function percentile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? 0
}

/**
 * Reads the song audio and the vocals audio about every 100 ms for `ms` milliseconds.
 * Each sample holds the play state of both elements and the difference of their play times.
 */
const SAMPLE_AUDIO = (ms: number) => `new Promise((resolve) => {
  const song = document.querySelector('audio[data-audio-row="song"]')
  const vocals = document.querySelector('audio[data-audio-row="vocals"]')
  const samples = []
  const read = () => samples.push({
    songMuted: song.muted,
    vocalsMuted: vocals.muted,
    songPaused: song.paused,
    vocalsPaused: vocals.paused,
    songTime: song.currentTime,
    vocalsTime: vocals.currentTime,
    vocalsRate: vocals.playbackRate,
    driftMs: Math.abs(song.currentTime - vocals.currentTime) * 1000,
  })
  const timer = setInterval(read, 100)
  setTimeout(() => { clearInterval(timer); read(); resolve(samples) }, ${ms})
})`

type Sample = {
  songMuted: boolean
  vocalsMuted: boolean
  songPaused: boolean
  vocalsPaused: boolean
  songTime: number
  vocalsTime: number
  vocalsRate: number
  driftMs: number
}

async function sample(page: Page, ms: number): Promise<Sample[]> {
  return (await page.evaluate(SAMPLE_AUDIO(ms))) as Sample[]
}

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

/** Runs a transcribe run with the vocal separation. A singer count also turns on the singer step with that count. */
async function transcribeSeparated(page: Page, singerCount?: string) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('checkbox', { name: 'Separate the vocals first' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Keep the separated tracks' })).toBeChecked()
  if (singerCount !== undefined) {
    await dialog
      .getByRole('checkbox', { name: 'Put each singer on its own voice (experimental)' })
      .check()
    await dialog
      .getByRole('group', { name: 'Singers' })
      .getByRole('radio', { name: singerCount })
      .check()
  }
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has two worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/**
 * Checks that both elements play, that only the vocals sound, and that the vocals stay in time.
 * The samples start after a settle time of 500 ms. 90% of the samples must be inside `P90_LIMIT_MS`.
 * One stalled sample must still be inside `STALL_LIMIT_MS`, so a mixer that stops its correction still fails.
 */
function expectInTime(samples: Sample[], rate: number) {
  for (const entry of samples) {
    expect(entry).toMatchObject({
      songMuted: true,
      vocalsMuted: false,
      songPaused: false,
      vocalsPaused: false,
      vocalsRate: rate,
    })
    expect(entry.driftMs).toBeLessThanOrEqual(STALL_LIMIT_MS)
  }
  const drifts = samples.map((entry) => entry.driftMs)
  const p90 = percentile(drifts, 0.9)
  // The annotation keeps the measured values in the report of the run.
  test.info().annotations.push({
    type: 'drift',
    description: `rate ${rate}: p50 ${percentile(drifts, 0.5).toFixed(1)} ms, p90 ${p90.toFixed(1)} ms, max ${Math.max(...drifts).toFixed(1)} ms`,
  })
  expect(p90).toBeLessThanOrEqual(P90_LIMIT_MS)
  const first = samples[0]
  const last = samples.at(-1)
  if (first === undefined || last === undefined) throw new Error('No samples.')
  expect(last.songTime).toBeGreaterThan(first.songTime)
  expect(last.vocalsTime).toBeGreaterThan(first.vocalsTime)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

test('a song with no run shows no "Audio tracks" group', async ({ page }) => {
  await createSong(page)
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled()
  await expect(page.getByRole('group', { name: 'Audio tracks' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mute Song' })).toHaveCount(0)
})

test('the vocals play alone and in time with the song audio after "Solo" on "Vocals"', async ({
  page,
}) => {
  await createSong(page)
  await transcribeSeparated(page)

  const group = page.getByRole('group', { name: 'Audio tracks' })
  await expect(group).toBeVisible({ timeout: 20_000 })
  for (const row of ['vocals', 'instruments']) {
    const box = await page.locator(`.track-row[data-row="${row}"] canvas`).boundingBox()
    expect(box?.width).toBeGreaterThan(0)
    expect(box?.height).toBeGreaterThan(0)
  }
  await expect(group.getByRole('button', { name: 'Mute Vocals' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await group.getByRole('button', { name: 'Solo Vocals' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  // The first check of the mixer moves the vocals to the song time, so the samples start after it.
  await page.waitForTimeout(500)
  expectInTime(await sample(page, 3000), 1)

  await page.getByRole('button', { name: '50%' }).click()
  await page.waitForTimeout(500)
  expectInTime(await sample(page, 3000), 0.5)
  await page.getByRole('button', { name: 'Pause' }).click()

  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Solo Vocals' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Mute Instruments' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the phoneme layer stays on the screen after a run that made singer rows', async ({
  page,
}) => {
  await createSong(page)
  await transcribeSeparated(page, '4')

  const group = page.getByRole('group', { name: 'Audio tracks' })
  await expect(group).toBeVisible({ timeout: 20_000 })
  await expect(group.locator('.track-row[data-row^="singer:"]').first()).toBeAttached({
    timeout: 20_000,
  })
  expect(await group.locator('.track-row').count()).toBeGreaterThan(4)
  // The rows hold more height than the list shows, so the list scrolls inside.
  const [scroll, client] = (await page.evaluate(
    "[document.querySelector('.track-list').scrollHeight, document.querySelector('.track-list').clientHeight]",
  )) as [number, number]
  expect(scroll).toBeGreaterThan(client)
  await expect(page.getByRole('list', { name: 'Phonemes' })).toBeInViewport({ ratio: 1 })
})

/** Checks that each track waveform has the left edge and the width of the time ruler, under the line of its name. */
async function expectWavesInLine(page: Page) {
  const ruler = await page.locator('.time-ruler').boundingBox()
  for (const row of ['vocals', 'instruments']) {
    const wave = await page.locator(`.track-row[data-row="${row}"] canvas`).boundingBox()
    const name = await page.locator(`.track-row[data-row="${row}"] .row-controls`).boundingBox()
    if (ruler === null || wave === null || name === null) throw new Error(`No box for ${row}.`)
    expect(wave.x).toBe(ruler.x)
    expect(wave.width).toBe(ruler.width)
    // The line of the name ends where the waveform starts, so it covers no part of it.
    expect(name.y + name.height).toBeLessThanOrEqual(wave.y)
  }
}

test('each row shows whether it sounds, and its name sits above its waveform', async ({ page }) => {
  await createSong(page)
  await transcribeSeparated(page)

  const group = page.getByRole('group', { name: 'Audio tracks' })
  await expect(group).toBeVisible({ timeout: 20_000 })
  await expect(group.getByText('The tracks start muted.', { exact: false })).toBeVisible()
  await group.getByRole('button', { name: 'Solo Vocals' }).click()

  const songSound = group.locator('.track-row[data-row="song"] .row-sound')
  await expect(songSound).toHaveText(/silent/)
  await expect(songSound).toHaveAttribute('title', 'Silent, because "Solo" is on for Vocals.')
  await expect(group.getByRole('button', { name: 'Mute Vocals' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute(
    'title',
    'The song audio is muted. See "Audio tracks".',
  )

  // The canvas starts at the left edge of the stage, as the time ruler, at each zoom level.
  await expectWavesInLine(page)
  await page.getByRole('slider', { name: 'Zoom' }).fill('400')
  await expectWavesInLine(page)

  await group.getByRole('button', { name: 'Audio tracks' }).click()
  await expect(group.getByTestId('track-plays')).toHaveText('— plays: Vocals')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(page.getByTestId('track-plays')).toHaveText('— plays: Vocals')
})

/** Returns the image of the waveform canvas of each singer row, by row id. */
async function singerImages(page: Page): Promise<Record<string, string>> {
  return (await page.evaluate(`Object.fromEntries(
    [...document.querySelectorAll('.track-row[data-row^="singer:"]')].map((row) => [
      row.dataset.row,
      row.querySelector('canvas')?.toDataURL() ?? '',
    ]),
  )`)) as Record<string, string>
}

/** Waits until the singer rows draw the same images on two reads in a row, and returns them. */
async function stableImages(page: Page): Promise<Record<string, string>> {
  let last = await singerImages(page)
  await expect
    .poll(async () => {
      const next = await singerImages(page)
      const same = JSON.stringify(next) === JSON.stringify(last)
      last = next
      return same
    })
    .toBe(true)
  return last
}

async function voiceMenu(page: Page, voice: string, item: string) {
  const rail = page.getByRole('complementary', { name: 'Voices' })
  await rail.getByRole('button', { name: `Actions for ${voice}`, exact: true }).click()
  await rail
    .getByRole('menu', { name: `Actions for ${voice}` })
    .getByRole('menuitem', { name: item, exact: true })
    .click()
}

async function reportVoiceNames(page: Page): Promise<string[]> {
  await page.locator('.editor-top').getByRole('button', { name: 'Run report' }).click()
  const panel = page.getByRole('dialog', { name: 'Run report' })
  const table = panel.getByRole('table', { name: 'The voices that hold phrases of the run' })
  await expect(table).toBeVisible()
  const names = await table.locator('tbody tr > :first-child').allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  return names
}

test('a renamed singer voice keeps its row and its ranges, and a deleted one loses its row until an undo', async ({
  page,
}) => {
  await createSong(page)
  await transcribeSeparated(page, '2')
  const group = page.getByRole('group', { name: 'Audio tracks' })
  const singerRows = group.locator('.track-row[data-row^="singer:"]')
  await expect(singerRows).toHaveCount(2, { timeout: 20_000 })
  const before = await stableImages(page)

  await voiceMenu(page, 'Singer 2', 'Rename')
  const field = page.getByRole('textbox', { name: 'Voice name' })
  await field.fill('Test Alto')
  await field.press('Enter')

  await expect(group.getByRole('button', { name: 'Mute Test Alto', exact: true })).toBeVisible()
  await expect(group.getByRole('button', { name: 'Mute Lead Vocals', exact: true })).toBeVisible()
  // The same rows draw the same ranges in the same colours: only the name changed.
  expect(await stableImages(page)).toEqual(before)
  expect(await reportVoiceNames(page)).toEqual(['Lead Vocals', 'Test Alto'])

  await voiceMenu(page, 'Test Alto', 'Delete')
  await page
    .getByRole('dialog', { name: 'The app deletes “Test Alto” and its marks.' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()

  await expect(singerRows).toHaveCount(1)
  const afterDelete = await stableImages(page)
  // The row of "Lead Vocals" does not take the ranges of the deleted voice.
  expect(Object.keys(afterDelete)).toHaveLength(1)
  for (const [id, image] of Object.entries(afterDelete)) expect(image).toBe(before[id])
  expect(await reportVoiceNames(page)).toEqual(['Lead Vocals', 'Singer 2 (deleted)'])

  await page.keyboard.press('ControlOrMeta+z')

  await expect(group.getByRole('button', { name: 'Mute Test Alto', exact: true })).toBeVisible()
  expect(await stableImages(page)).toEqual(before)
})
