import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms.
// The first word "is" is from 11 250 ms to 11 950 ms, so the loop plays from 11 100 ms to 11 950 ms.
const LOOP_START_MS = 11_100
const LOOP_END_MS = 11_950

type StoredMark = { label: string; layer: string; startMs: number; endMs: number }

// The script is a string because the tsconfig of the tests has no DOM types.
const READ_SONG = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction(['songs', 'marks'], 'readonly')
    const songs = tx.objectStore('songs').getAll()
    const marks = tx.objectStore('marks').getAll()
    tx.oncomplete = () => resolve({ frameMs: songs.result[0].frameMs, marks: marks.result })
    tx.onerror = () => reject(tx.error)
  }
})`

async function readSong(page: Page): Promise<{ frameMs: number; marks: StoredMark[] }> {
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  return page.evaluate(READ_SONG)
}

/** Returns the start of the first word "night" in the stored song. */
function firstNightStart(marks: StoredMark[]): number | undefined {
  return marks
    .filter((mark) => mark.label === 'night' && mark.layer === 'word')
    .sort((a, b) => a.startMs - b.startMs)[0]?.startMs
}

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

function word(page: Page, label: string): Locator {
  return page
    .getByRole('list', { name: 'Words' })
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first()
}

async function playTime(page: Page): Promise<number> {
  const [ms] = parsePlayTimes([(await page.getByLabel('Play time').textContent()) ?? ''])
  return ms ?? Number.NaN
}

// Records the text of the play time on each animation frame for 3 s: more than three passes of the loop.
const RECORD_PLAY_TIMES = `new Promise((resolve) => {
  const output = document.querySelector('output[aria-label="Play time"]')
  const texts = []
  const end = performance.now() + 3000
  const read = () => {
    texts.push(output.textContent)
    if (performance.now() < end) requestAnimationFrame(read)
    else resolve(texts)
  }
  requestAnimationFrame(read)
})`

function parsePlayTimes(texts: string[]): number[] {
  return texts.map((text) => {
    const match = /^(\d+):(\d+)\.(\d+)$/.exec(text)
    return match === null
      ? Number.NaN
      : Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(match[3])
  })
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

test('repeats the selected word with L until the person presses Space', async ({ page }) => {
  await openDemoSong(page)
  await word(page, 'is').click()
  await expect(word(page, 'is')).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('l')
  const loop = page.getByRole('button', { name: 'Loop' })
  await expect(loop).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

  // A poll of the play time can miss the jump back, so the page records the play time on each animation frame.
  const samples = parsePlayTimes(await page.evaluate(RECORD_PLAY_TIMES))
  const jumps = samples.filter((ms, index) => index > 0 && ms < (samples[index - 1] ?? 0) - 400)
  expect(jumps.length).toBeGreaterThanOrEqual(2)
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(LOOP_START_MS)
  expect(Math.max(...samples)).toBeLessThanOrEqual(LOOP_END_MS)
  expect(Math.max(...samples)).toBeGreaterThan(LOOP_END_MS - 100)

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(loop).toHaveAttribute('aria-pressed', 'false')
  const stopped = await playTime(page)
  await page.waitForTimeout(1000)
  expect(await playTime(page)).toBe(stopped)
})

test('plays at half speed after the person chooses 50%', async ({ page }) => {
  await openDemoSong(page)
  await page.getByRole('button', { name: '50%' }).click()
  await expect(page.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => playTime(page)).toBeGreaterThan(200)
  const fromMs = await playTime(page)
  const fromClock = Date.now()
  await page.waitForTimeout(2000)
  const rate = ((await playTime(page)) - fromMs) / (Date.now() - fromClock)
  await page.getByRole('button', { name: 'Pause' }).click()

  expect(rate).toBeGreaterThan(0.35)
  expect(rate).toBeLessThan(0.65)
})

test('snaps every mark to a multiple of the new frame size after the confirm dialog', async ({
  page,
}) => {
  await openDemoSong(page)
  // At a zoom of 100 px for each second, 1 px is 10 ms.
  await page.getByRole('slider', { name: 'Zoom' }).fill('100')
  await page.getByTestId('waveform-stage').hover()
  await page.mouse.wheel(0, -1_000_000)
  await expect.poll(async () => (await box(word(page, 'Silent'))).x).toBeGreaterThan(0)

  await page.getByRole('button', { name: '25 ms' }).click()
  await page
    .getByRole('dialog', { name: 'The app moves every mark of this song to a multiple of 25 ms.' })
    .getByRole('button', { name: 'Continue' })
    .click()
  await expect(page.getByRole('button', { name: '25 ms' })).toHaveAttribute('aria-pressed', 'true')

  // A drag of the start of "night" by 7 px earlier moves it 70 ms, which snaps to 75 ms at 25 ms.
  const night = word(page, 'night')
  await night.click()
  const before = await box(night)
  const y = before.y + before.height / 2
  await page.mouse.move(before.x + 3, y)
  await page.mouse.down()
  await page.mouse.move(before.x, y, { steps: 4 })
  await page.mouse.move(before.x - 4, y, { steps: 4 })
  await page.mouse.up()
  // The autosave writes the change after a short wait, so the test reads the storage again until it has the change.
  await expect.poll(async () => firstNightStart((await readSong(page)).marks)).toBe(2225)
  expect((await readSong(page)).frameMs).toBe(25)

  await page.getByRole('button', { name: '50 ms' }).click()
  await page
    .getByRole('dialog', { name: 'The app moves every mark of this song to a multiple of 50 ms.' })
    .getByRole('button', { name: 'Continue' })
    .click()
  await expect(page.getByRole('button', { name: '50 ms' })).toHaveAttribute('aria-pressed', 'true')

  await expect
    .poll(async () => {
      const coarse = await readSong(page)
      return coarse.marks.filter((mark) => mark.startMs % 50 !== 0 || mark.endMs % 50 !== 0)
    })
    .toEqual([])
  const coarse = await readSong(page)
  expect(coarse.frameMs).toBe(50)
  expect(firstNightStart(coarse.marks)).toBe(2250)
})
