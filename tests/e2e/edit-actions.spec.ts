import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms.

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

function layer(page: Page, name: string): Locator {
  return page.getByRole('list', { name }).getByRole('listitem')
}

function markButton(page: Page, name: string): Locator {
  return page.getByRole('group', { name: 'Mark' }).getByRole('button', { name })
}

/** Moves the play cursor to the middle of the mark with a click on the waveform. */
async function cursorInto(page: Page, mark: Locator) {
  const box = await mark.boundingBox()
  const stage = await page.getByTestId('waveform-stage').boundingBox()
  if (box === null || stage === null) throw new Error('The mark or the waveform has no box.')
  await page.mouse.click(box.x + box.width / 2, stage.y + stage.height / 2)
}

test('splits, merges and deletes a word with the mouse only', async ({ page }) => {
  await openDemoSong(page)
  await page.getByRole('slider', { name: 'Zoom' }).fill('100')
  await page.getByTestId('waveform-stage').hover()
  await page.mouse.wheel(0, -1_000_000)
  const words = layer(page, 'Words')
  const count = await words.count()
  const silent = words.filter({ hasText: /^Silent$/ })
  await expect.poll(async () => (await silent.boundingBox())?.x ?? -1).toBeGreaterThan(0)

  await silent.click()
  await cursorInto(page, silent)
  await markButton(page, 'Split').click()
  await expect(words).toHaveCount(count + 1)

  await markButton(page, 'Merge with next').click()
  await expect(words).toHaveCount(count)

  await markButton(page, 'Delete').click()
  await expect(words).toHaveCount(count - 1)
})

test('states the reason of a mark button that cannot act', async ({ page }) => {
  await openDemoSong(page)
  const words = layer(page, 'Words')

  await words.filter({ hasText: /^holy$/ }).click()
  await expect(markButton(page, 'Split')).toHaveAttribute(
    'title',
    'Move the play cursor into the mark. Then press S. (S)',
  )
  await expect(markButton(page, 'Split')).toHaveAttribute('aria-disabled', 'true')

  await words.last().click()
  await expect(markButton(page, 'Merge with next')).toHaveAccessibleDescription(
    'This is the last mark of the layer.',
  )
})

test('opens the shortcut list with the "Shortcuts" button', async ({ page }) => {
  await openDemoSong(page)

  await page.getByRole('button', { name: 'Shortcuts' }).click()

  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})

test('changes the help line with the selection', async ({ page }) => {
  await openDemoSong(page)
  const help = page.locator('.help-line')
  await expect(help).toContainText('Double-click an empty place to add a mark.')
  await expect(help).toContainText('Hold Shift and click to select more than one mark.')

  await layer(page, 'Words').first().click()
  await expect(help).toContainText('Drag an edge to change the time. Drag the mark to move it.')

  const phoneme = layer(page, 'Phonemes').first()
  await phoneme.click()
  await expect(help).toContainText('Click the phoneme again to choose a mouth shape.')
})

/** Loads the editor again, so the next Tab starts at the page top. A blur keeps the start point of the browser. */
async function fromPageTop(page: Page) {
  await page.reload()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

/** Presses Tab from the page top until "Play" has the focus, and returns the count of presses. */
async function tabsToPlay(page: Page): Promise<number> {
  await fromPageTop(page)
  const play = page.getByRole('button', { name: 'Play' })
  for (let count = 1; count <= 40; count++) {
    await page.keyboard.press('Tab')
    if (await play.evaluate((element) => element.matches(':focus'))) return count
  }
  return Infinity
}

test('reaches "Play" with one Tab and Enter on the skip link', async ({ page }) => {
  await openDemoSong(page)
  await fromPageTop(page)

  // The theme button of the app shell comes first. The skip link is the first Tab stop of the editor.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to the transport' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused()
})

test('reaches "Play" with Tab only in a count that does not change with the count of marks', async ({
  page,
}) => {
  await openDemoSong(page)
  // The theme button, the skip link, 6 top bar controls, 4 controls of one voice, 3 layers, then "Play".
  // "Run report" is a Tab stop also with no run, so its tooltip can state the reason.
  expect(await tabsToPlay(page)).toBe(16)

  // Two splits add two words and their phonemes.
  for (let split = 0; split < 2; split++) {
    const word = layer(page, 'Words').first()
    await word.click()
    await cursorInto(page, word)
    await page.keyboard.press('s')
  }
  await expect(layer(page, 'Words')).toHaveCount(18)

  expect(await tabsToPlay(page)).toBe(16)
})

test('selects each word of the layer with the keyboard only', async ({ page }) => {
  await openDemoSong(page)
  const words = layer(page, 'Words')
  await fromPageTop(page)
  // The theme button, the skip link, 6 top bar controls, 4 controls of the voice, the phrase layer, then the word layer.
  for (let count = 0; count < 14; count++) await page.keyboard.press('Tab')
  await expect(words.first()).toBeFocused()

  await page.keyboard.press(']')
  await expect(words.first()).toHaveAttribute('aria-current', 'true')
  for (let index = 1; index < 16; index++) {
    await page.keyboard.press(']')
    await expect(words.nth(index)).toHaveAttribute('aria-current', 'true')
  }
  await page.keyboard.press('[')
  await expect(words.nth(14)).toHaveAttribute('aria-current', 'true')
})

test('plays with Space after a click on "75%"', async ({ page }) => {
  await openDemoSong(page)

  await page.getByRole('button', { name: '75%' }).click()
  await page.keyboard.press(' ')

  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(page.getByRole('button', { name: '75%' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press(' ')
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('shows the bracket keys and no Tab key for the marks in the shortcut list', async ({
  page,
}) => {
  await openDemoSong(page)

  await page.keyboard.press('?')

  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(list.getByText('Select the previous or the next mark of the layer')).toBeVisible()
  await expect(list.getByText('Select the next or the previous mark')).toHaveCount(0)
})

function status(page: Page): Locator {
  return page.locator('.status-line')
}

test('states the reason in the status line when a key or a drag does nothing', async ({ page }) => {
  await openDemoSong(page)
  const words = layer(page, 'Words')

  await words.filter({ hasText: /^holy$/ }).click()
  await page.keyboard.press('s')
  await expect(status(page)).toHaveText('Move the play cursor into the mark. Then press S.')

  await words.last().click()
  await page.keyboard.press('m')
  await expect(status(page)).toHaveText('This is the last mark of the layer.')

  // "and" has two phonemes. After one delete, its last phoneme stays.
  const and = words.filter({ hasText: /^and$/ })
  await and.click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Delete')
  await and.click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Delete')
  await expect(status(page)).toHaveText('A word needs one phoneme or more. Delete the word.')

  // The second "night" touches "holy" and the end of its phrase.
  const night = words.nth(3)
  const box = await night.boundingBox()
  if (box === null) throw new Error('The word has no box.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(status(page)).toHaveText('The mark has no room to move.')
})

test('states the end of the song for a typed time after it', async ({ page }) => {
  await openDemoSong(page)
  await layer(page, 'Words').first().click()
  const end = page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('textbox', { name: 'End' })

  await end.fill('0:99.000')
  await end.press('Enter')

  await expect(page.getByRole('alert')).toHaveText('The song ends at 0:28.900.')
})

test('opens the phoneme list with no scroll of the stage', async ({ page }) => {
  await openDemoSong(page)
  const phoneme = layer(page, 'Phonemes').first()
  const stage = page.locator('.stage')
  await phoneme.click()
  const before = await stage.evaluate((element) => [element.scrollTop, element.scrollHeight])

  await phoneme.click()

  await expect(page.getByRole('listbox', { name: 'Phoneme label' })).toBeVisible()
  expect(await stage.evaluate((element) => [element.scrollTop, element.scrollHeight])).toEqual(
    before,
  )
})
