import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms and the song is 28 900 ms long.
const DEMO_DURATION_MS = 28_900
const FRAME_MS = 50

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

function layer(page: Page, name: 'Phrases' | 'Words' | 'Phonemes'): Locator {
  return page.getByRole('list', { name })
}

function word(page: Page, label: string): Locator {
  return layer(page, 'Words')
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}( \\(.*\\))*$`) })
    .first()
}

/** Returns the time in ms of a tooltip time `m:ss.mmm`. */
function ms(text: string): number {
  const [minutes = '0', seconds = '0'] = text.split(':')
  return Math.round((Number(minutes) * 60 + Number(seconds)) * 1000)
}

/** Returns the start and the end of a mark from the second line of its tooltip. */
async function markTimes(mark: Locator): Promise<{ startMs: number; endMs: number }> {
  const title = (await mark.getAttribute('title')) ?? ''
  const match = /\n(\d+:\d{2}\.\d{3}) to (\d+:\d{2}\.\d{3})$/.exec(title)
  if (!match?.[1] || !match[2]) throw new Error(`The tooltip "${title}" has no times.`)
  return { startMs: ms(match[1]), endMs: ms(match[2]) }
}

/** Expects that no mark of the layer draws over the next mark of the layer. */
async function expectNoOverlap(page: Page, name: 'Phrases' | 'Words' | 'Phonemes') {
  const boxes = await layer(page, name)
    .getByRole('listitem')
    .evaluateAll((items) =>
      items
        .map((item) => ({ rect: item.getBoundingClientRect(), id: item.textContent }))
        .map(({ rect, id }) => ({ left: rect.left, right: rect.right, id }))
        .sort((a, b) => a.left - b.left),
    )
  expect(boxes.length).toBeGreaterThan(0)
  for (let i = 1; i < boxes.length; i++)
    expect(
      boxes[i - 1]?.right ?? 0,
      `${name}: ${JSON.stringify(boxes.slice(i - 1, i + 1))}`,
    ).toBeLessThanOrEqual((boxes[i]?.left ?? 0) + 0.05)
}

test('gives each new word of a changed phrase 3 frames or more, with no word over another', async ({
  page,
}) => {
  await openDemoSong(page)

  await layer(page, 'Phrases')
    .getByRole('listitem')
    .filter({ hasText: 'All is calm, all is bright' })
    .dblclick()
  const field = page.getByRole('textbox', { name: 'Phrase label' })
  await field.fill('All is calm and all is bright tonight')
  await field.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()

  await expect(word(page, 'tonight')).toBeAttached()
  const and = await markTimes(word(page, 'and'))
  const tonight = await markTimes(word(page, 'tonight'))
  expect(and.endMs - and.startMs).toBeGreaterThanOrEqual(3 * FRAME_MS)
  expect(tonight.endMs - tonight.startMs).toBeGreaterThanOrEqual(3 * FRAME_MS)
  await expectNoOverlap(page, 'Words')

  // One undo step restores the old words.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(word(page, 'tonight')).toHaveCount(0)
  await expect(word(page, 'calm')).toBeAttached()
})

test('adds a word of 10 frames with a double-click near the end of a gap', async ({ page }) => {
  await openDemoSong(page)
  const track = await box(layer(page, 'Words'))
  // The gap between the phrases goes from 8 950 ms to 9 800 ms. The pointer is at 9 700 ms.
  const x = track.x + (9_700 / DEMO_DURATION_MS) * track.width

  await page.mouse.dblclick(x, track.y + track.height / 2)
  const field = page.getByRole('textbox', { name: 'Word label' })
  await field.fill('Oh')
  await field.press('Enter')

  const oh = word(page, 'Oh')
  await expect(oh).toBeAttached()
  expect(await markTimes(oh)).toEqual({ startMs: 9_300, endMs: 9_800 })
  const phrase = layer(page, 'Phrases').getByRole('listitem').filter({ hasText: /^Oh$/ })
  expect(await markTimes(phrase)).toEqual({ startMs: 9_300, endMs: 9_800 })
})

test('draws a mark of one frame with no overlap and with handles that a person can take', async ({
  page,
}) => {
  await openDemoSong(page)
  // "is" goes from 11 250 ms to 11 950 ms. 13 presses move its end to 11 300 ms.
  const is = word(page, 'is')
  await is.click()
  for (let i = 0; i < 13; i++) await page.keyboard.press('Shift+Alt+ArrowLeft')
  await expect.poll(async () => (await markTimes(is)).endMs).toBe(11_300)

  await expect(is).toHaveAttribute('data-short', 'true')
  await expect(is).toHaveAttribute('data-handles', 'outer')
  const isBox = await box(is)
  const end = await box(is.locator('[data-edge="end"]'))
  const start = await box(is.locator('[data-edge="start"]'))
  expect(end.width).toBeGreaterThanOrEqual(8)
  expect(start.width).toBeGreaterThanOrEqual(8)
  // The handles hang under the bar, so they cover no bar of the adjacent marks.
  expect(end.y).toBeGreaterThanOrEqual(isBox.y + isBox.height - 0.5)

  for (const zoom of ['10', '31', '100', '1000']) {
    await page.getByRole('slider', { name: 'Zoom' }).fill(zoom)
    for (const name of ['Phrases', 'Words', 'Phonemes'] as const) await expectNoOverlap(page, name)
  }

  // A drag on the end handle moves the end, so the mark is longer again.
  await page.getByRole('slider', { name: 'Zoom' }).fill('31')
  const handle = await box(is.locator('[data-edge="end"]'))
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2, {
    steps: 4,
  })
  await page.mouse.up()
  await expect.poll(async () => (await markTimes(is)).endMs).toBeGreaterThan(11_300)
})

test('keeps the selected word in view after a zoom with the slider', async ({ page }) => {
  await openDemoSong(page)
  const mother = word(page, 'mother')
  await mother.click()

  await page.getByRole('slider', { name: 'Zoom' }).fill('150')

  const stage = await box(page.locator('.stage'))
  const motherBox = await box(mother)
  expect(motherBox.x).toBeGreaterThanOrEqual(stage.x)
  expect(motherBox.x + motherBox.width).toBeLessThanOrEqual(stage.x + stage.width)
})

test('changes the zoom by 40% or more with five arrow keys on the slider', async ({ page }) => {
  await openDemoSong(page)
  const slider = page.getByRole('slider', { name: 'Zoom' })
  const before = Number(await slider.inputValue())

  await slider.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')

  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThanOrEqual(before * 1.4)
})

test('shows a selected phoneme at 40 px or more after "Zoom to selection" and the full song after "Fit song"', async ({
  page,
}) => {
  await openDemoSong(page)
  // The layers draw only the marks in view, so the test finds the phoneme by its id after the zoom.
  const id = await layer(page, 'Phonemes').getByRole('listitem').nth(4).getAttribute('data-mark-id')
  const phoneme = page.locator(`[data-mark-id="${id}"]`)
  await phoneme.click()
  await expect(phoneme).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('z')
  await expect.poll(async () => (await box(phoneme)).width).toBeGreaterThanOrEqual(40)

  await page.getByRole('button', { name: 'Fit song' }).click()
  const track = await box(layer(page, 'Words'))
  const first = await box(word(page, 'Silent'))
  expect(first.x - track.x).toBeCloseTo((100 / DEMO_DURATION_MS) * track.width, 0)
})

test('folds both side panels at 1024 px, so the stage is 700 px or wider', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openDemoSong(page)
  const voices = page.getByRole('button', { name: 'Voices', exact: true })
  const inspector = page.getByRole('button', { name: 'Inspector', exact: true })

  await expect(voices).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector).toHaveAttribute('aria-expanded', 'false')
  expect((await box(page.locator('.stage'))).width).toBeGreaterThanOrEqual(700)

  await inspector.click()
  await expect(inspector).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'Face preview' })).toBeVisible()

  // The browser keeps the choice of the person.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Inspector', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})
