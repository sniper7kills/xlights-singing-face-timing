import { expect, test } from '@playwright/test'

// The scripts are strings because the tsconfig of the tests has no DOM types.
const COUNT_MARKS_BY_LAYER = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const all = open.result.transaction('marks').objectStore('marks').getAll()
    all.onsuccess = () => {
      const counts = {}
      for (const mark of all.result) counts[mark.layer] = (counts[mark.layer] ?? 0) + 1
      resolve(counts)
    }
  }
})`

test('creates the demo song with words and phonemes, keeps it after a reload and deletes it', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Try the demo song' }).focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/#\/song\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  expect(await page.evaluate(COUNT_MARKS_BY_LAYER)).toEqual({ phrase: 3, word: 16, phoneme: 51 })

  await page.goto('/#/')
  await page.reload()
  const song = page.getByRole('link', { name: /Silent Night/ })
  await expect(song).toContainText('0:29')
  await expect(page.getByRole('button', { name: 'Try the demo song' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Delete Silent Night' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: /Silent Night/ })).toHaveCount(0)
  expect(await page.evaluate(COUNT_MARKS_BY_LAYER)).toEqual({})
})

test('shows the load message and stays in the song library when the demo files do not load', async ({
  page,
}) => {
  await page.route('**/demo/silent-night.marks.json', (route) => route.abort())
  await page.goto('/')

  await page.getByRole('button', { name: 'Try the demo song' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'The demo song did not load. Check the connection and retry.',
  )
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
})
