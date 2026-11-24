import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms.
// At a zoom of 100 px for each second, 1 px is 10 ms.
const ZOOM = '100'

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
  // The marks must be wide enough to take an edge handle.
  await page.getByRole('slider', { name: 'Zoom' }).fill(ZOOM)
  await page.getByTestId('waveform-stage').hover()
  // The slider keeps the centre of the stage in place, so the wheel goes back to the song start.
  await page.mouse.wheel(0, -1_000_000)
  await expect.poll(async () => (await box(word(page, 'Silent'))).x).toBeGreaterThan(0)
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

function word(page: Page, label: string, index = 0): Locator {
  return page
    .getByRole('list', { name: 'Words' })
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .nth(index)
}

function phonemes(page: Page): Locator {
  return page.getByRole('list', { name: 'Phonemes' }).getByRole('listitem')
}

/** Returns the left edge and the right edge of each phoneme inside the range, in time order. */
async function phonemeEdges(page: Page, left: number, right: number) {
  const edges: { left: number; right: number; label: string }[] = []
  for (const item of await phonemes(page).all()) {
    const { x, width } = await box(item)
    if (x + width / 2 > left && x + width / 2 < right)
      edges.push({ left: x, right: x + width, label: (await item.textContent()) ?? '' })
  }
  return edges.sort((a, b) => a.left - b.left)
}

/** Expects the phonemes under the word to fill it from edge to edge with no gap. */
async function expectFilled(page: Page, target: Locator) {
  const { x, width } = await box(target)
  const edges = await phonemeEdges(page, x, x + width)
  expect(edges.length).toBeGreaterThan(0)
  expect(edges[0]?.left).toBeCloseTo(x, 0)
  expect(edges.at(-1)?.right).toBeCloseTo(x + width, 0)
  for (let index = 1; index < edges.length; index++)
    expect(edges[index]?.left).toBeCloseTo(edges[index - 1]?.right ?? 0, 0)
}

async function dragBy(page: Page, fromX: number, y: number, dx: number) {
  await page.mouse.move(fromX, y)
  await page.mouse.down()
  await page.mouse.move(fromX + dx / 2, y, { steps: 4 })
  await page.mouse.move(fromX + dx, y, { steps: 4 })
  await page.mouse.up()
}

test('drags the left edge of the second word earlier, makes the first word shorter and keeps the change after a reload', async ({
  page,
}) => {
  await openDemoSong(page)
  const silent = word(page, 'Silent')
  const night = word(page, 'night')
  const before = await box(night)

  await night.click()
  await expect(night).toHaveAttribute('aria-current', 'true')
  // The start handle is at the left edge of the selected mark. 50 px is 500 ms.
  await dragBy(page, before.x + 3, before.y + before.height / 2, -50)

  await expect.poll(async () => (await box(night)).x).toBeCloseTo(before.x - 50, 0)
  const silentBox = await box(silent)
  const nightBox = await box(night)
  expect(silentBox.x + silentBox.width).toBeCloseTo(nightBox.x, 0)
  expect(nightBox.x + nightBox.width).toBeCloseTo(before.x + before.width, 0)
  await expectFilled(page, silent)
  await expectFilled(page, night)

  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
  await expect.poll(async () => (await box(word(page, 'night'))).x).toBeCloseTo(nightBox.x, 0)
  const silentAfter = await box(word(page, 'Silent'))
  expect(silentAfter.x + silentAfter.width).toBeCloseTo(nightBox.x, 0)
})

test('drags a word body later and stops it at the next word', async ({ page }) => {
  await openDemoSong(page)
  // The first "night" is from 2300 ms to 4650 ms, and "holy" starts at 4700 ms.
  const night = word(page, 'night')
  const holy = word(page, 'holy')
  const before = await box(night)

  await dragBy(page, before.x + before.width / 2, before.y + before.height / 2, 300)

  await expect.poll(async () => (await box(night)).x).toBeCloseTo(before.x + 5, 0)
  const after = await box(night)
  expect(after.width).toBeCloseTo(before.width, 0)
  expect(after.x + after.width).toBeCloseTo((await box(holy)).x, 0)
  await expect(night).toHaveAttribute('aria-current', 'true')
})

test('changes a word label with a double-click, new text and Enter, and gives the word new phonemes', async ({
  page,
}) => {
  await openDemoSong(page)
  const holy = word(page, 'holy')
  const holyBox = await box(holy)
  const labels = async () =>
    (await phonemeEdges(page, holyBox.x, holyBox.x + holyBox.width)).map((edge) => edge.label)
  expect(await labels()).toEqual(['etc', 'O', 'L', 'E'])

  await holy.dblclick()
  const field = page.getByRole('textbox', { name: 'Word label' })
  await expect(field).toHaveValue('holy')
  await field.fill('mama')
  await field.press('Enter')

  await expect(word(page, 'mama')).toBeVisible()
  await expect(field).toBeHidden()
  await expect.poll(labels).not.toEqual(['etc', 'O', 'L', 'E'])
  await expect.poll(labels).toContain('MBP')
  await expectFilled(page, word(page, 'mama'))
})

test('changes a phoneme label from the list of the ten phoneme labels', async ({ page }) => {
  await openDemoSong(page)
  const holyBox = await box(word(page, 'holy'))
  // The first "O" of the song is the second phoneme of "holy".
  const target = phonemes(page).filter({ hasText: /^O$/ }).first()
  expect((await box(target)).x).toBeGreaterThanOrEqual(holyBox.x - 1)

  await target.click()
  await target.click()
  const list = page.getByRole('listbox', { name: 'Phoneme label' })
  await expect(list.getByRole('option')).toHaveText([
    'AI',
    'E',
    'etc',
    'FV',
    'L',
    'MBP',
    'O',
    'rest',
    'U',
    'WQ',
  ])
  await list.getByRole('option', { name: 'MBP' }).click()

  await expect(list).toBeHidden()
  await expect
    .poll(async () =>
      (await phonemeEdges(page, holyBox.x, holyBox.x + holyBox.width)).map((edge) => edge.label),
    )
    .toEqual(['etc', 'MBP', 'L', 'E'])
})
