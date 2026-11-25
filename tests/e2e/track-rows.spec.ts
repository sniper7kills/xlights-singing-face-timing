import { expect, type Page, test } from '@playwright/test'

// The fixture workers download no model. The separate fixture gives the mono mix as the vocals.
// The E2E tests compile with no DOM types, so each script in the page is a string.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
`

/** The drift limit of `src/lib/audio/trackMix.ts`. The E2E tests do not import app code. */
const DRIFT_LIMIT_MS = 50

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

async function transcribeSeparated(page: Page) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('checkbox', { name: 'Separate the vocals first' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Keep the separated tracks' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has two worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/** Checks that both elements play, that only the vocals sound, and that the drift stays inside the limit. */
function expectInTime(samples: Sample[], rate: number) {
  for (const entry of samples) {
    expect(entry).toMatchObject({
      songMuted: true,
      vocalsMuted: false,
      songPaused: false,
      vocalsPaused: false,
      vocalsRate: rate,
    })
    expect(entry.driftMs).toBeLessThanOrEqual(DRIFT_LIMIT_MS)
  }
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
