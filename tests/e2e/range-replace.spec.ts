import { expect, type Locator, test } from '@playwright/test'

// The demo song: public/demo/silent-night.marks.json.
const DEMO_DURATION_MS = 28_900
// The selection starts inside the word "calm" (11 950–14 250 ms) and ends inside the word "Round" (19 450–20 800 ms).
const SELECTION = { startMs: 12_500, endMs: 20_000 }

// The script is a string because the tsconfig of the tests has no DOM types.
// It returns a text for each pair of saved marks that overlap on one layer of one voice, so a failure names the marks.
const SAVED_OVERLAPS = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const all = open.result.transaction('marks').objectStore('marks').getAll()
    all.onsuccess = () => {
      const marks = all.result.toSorted((a, b) => a.startMs - b.startMs)
      const last = new Map()
      const found = []
      for (const mark of marks) {
        const key = mark.voiceId + '/' + mark.layer
        const previous = last.get(key)
        if (previous && previous.endMs > mark.startMs)
          found.push(mark.layer + ': ' + previous.label + ' overlaps ' + mark.label)
        last.set(key, mark)
      }
      resolve(found)
    }
  }
})`

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (found === null) throw new Error('The element has no box.')
  return found
}

test('leaves no overlap on a layer after a transcribe run on a time selection that cuts a word', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('region', { name: 'Waveform' })).toHaveAttribute(
    'data-state',
    'ready',
  )

  const stage = await box(page.getByTestId('waveform-stage'))
  const xAt = (ms: number) => stage.x + (ms / DEMO_DURATION_MS) * stage.width
  const y = stage.y + stage.height / 2
  await page.mouse.move(xAt(SELECTION.startMs), y)
  await page.mouse.down()
  await page.mouse.move(xAt(16_000), y)
  await page.mouse.move(xAt(SELECTION.endMs), y)
  await page.mouse.up()
  await expect(page.getByTestId('time-selection')).toBeVisible()

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('radio', { name: /^The time selection/ }).check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('3 words, 0 estimated')).toBeVisible()

  const words = page.getByRole('list', { name: 'Words' }).getByRole('listitem')
  await expect(words.filter({ hasText: /^calm$/ })).toHaveCount(0)
  await expect(words.filter({ hasText: /^Round$/ })).toHaveCount(0)
  await expect(words.filter({ hasText: /^yon$/ })).toHaveCount(1)
  await expect(page.locator('.save-state')).toHaveText('Saved')
  expect(await page.evaluate(SAVED_OVERLAPS)).toEqual([])
})
