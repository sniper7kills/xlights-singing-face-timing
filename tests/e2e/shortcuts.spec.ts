import { expect, type Locator, type Page, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json. The frame size is 50 ms.
// At a zoom of 100 px for each second, one frame size is 5 px.

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )
}

function words(page: Page): Locator {
  return page.getByRole('list', { name: 'Words' }).getByRole('listitem')
}

function inspectorField(page: Page, name: string): Locator {
  return page.getByRole('complementary', { name: 'Inspector' }).getByRole('textbox', { name })
}

test('nudges a word with the key, splits it at the play cursor, undoes two times and redoes one time', async ({
  page,
}) => {
  await openDemoSong(page)
  await page.getByRole('slider', { name: 'Zoom' }).fill('100')
  await page.getByTestId('waveform-stage').hover()
  // The slider keeps the centre of the stage in place, so the wheel goes back to the song start.
  await page.mouse.wheel(0, -1_000_000)
  const silent = words(page).filter({ hasText: /^Silent$/ })
  await expect.poll(async () => (await silent.boundingBox())?.x ?? -1).toBeGreaterThan(0)
  const wordCount = await words(page).count()

  await silent.click()
  await expect(silent).toHaveAttribute('aria-current', 'true')
  const start = await inspectorField(page, 'Start').inputValue()
  const end = await inspectorField(page, 'End').inputValue()

  // The word touches the phrase start and the next word, so the key moves its start: the word gets one frame size shorter.
  await page.keyboard.press('Alt+ArrowRight')
  await expect(inspectorField(page, 'Start')).not.toHaveValue(start)
  const nudgedStart = await inspectorField(page, 'Start').inputValue()

  // A click on the waveform at the middle of the word puts the play cursor inside the word.
  const box = await silent.boundingBox()
  if (box === null) throw new Error('The word has no box.')
  const stage = await page.getByTestId('waveform-stage').boundingBox()
  if (stage === null) throw new Error('The waveform has no box.')
  await page.mouse.click(box.x + box.width / 2, stage.y + stage.height / 2)
  await page.keyboard.press('s')
  await expect(words(page)).toHaveCount(wordCount + 1)
  await expect(inspectorField(page, 'End')).not.toHaveValue(end)

  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(words(page)).toHaveCount(wordCount)
  await expect(inspectorField(page, 'Start')).toHaveValue(start)
  await expect(inspectorField(page, 'End')).toHaveValue(end)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await page.keyboard.press('ControlOrMeta+Shift+Z')
  await expect(inspectorField(page, 'Start')).toHaveValue(nudgedStart)
  await expect(words(page)).toHaveCount(wordCount)
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
})

test('opens the shortcut list with ? and closes it with Escape', async ({ page }) => {
  await openDemoSong(page)

  await page.keyboard.press('?')

  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(list).toBeVisible()
  await expect(list.getByText('Split the selected mark at the play cursor')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(list).toBeHidden()
})
