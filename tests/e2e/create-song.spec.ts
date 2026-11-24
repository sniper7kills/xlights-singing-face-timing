import { expect, test } from '@playwright/test'

test('creates a song from an audio file and opens the editor without a click', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')

  await expect(page).toHaveURL(/#\/song\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
})

test('creates one song from a dropped audio file', async ({ page }) => {
  await page.goto('/')
  const dropZone = page.getByRole('region', { name: 'Drop zone' })
  await expect(dropZone).toBeVisible()

  // Playwright has no drop of an operating system file, so the page builds the DataTransfer.
  // The scripts are strings because the tsconfig of the tests has no DOM types.
  const dataTransfer = await page.evaluateHandle(`(async () => {
    const bytes = await (await fetch('/demo/silent-night.ogg')).blob()
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'silent-night.ogg', { type: 'audio/ogg' }))
    return transfer
  })()`)
  await dropZone.dispatchEvent('drop', { dataTransfer })

  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  const songCount = await page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('singing-face-timing')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const count = open.result.transaction('songs').objectStore('songs').count()
      count.onsuccess = () => resolve(count.result)
    }
  })`)
  expect(songCount).toBe(1)
})

test('shows the file-type message for a text file and stays in the song library', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByLabel('Audio file').setInputFiles({
    name: 'lyrics.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Silent night, holy night'),
  })

  await expect(page.getByRole('alert')).toHaveText(
    'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
  )
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()
})
