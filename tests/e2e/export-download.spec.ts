import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

const GOLDEN = new URL('../fixtures/xtiming/demo-song.xtiming', import.meta.url)

// The app has no voice editor yet, so the test writes a second voice into IndexedDB.
// It moves the last phrase of the demo song, with its words and phonemes, to the new voice.
// The script is a string because the tsconfig of the tests has no DOM types.
function addSecondVoice(songId: string): string {
  return `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction(['voices', 'marks'], 'readwrite')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.objectStore('voices').put({
      id: 'e2e-voice-2', songId: ${JSON.stringify(songId)}, name: 'Choir', order: 1, color: '#4dd0e1',
    })
    const all = tx.objectStore('marks').getAll()
    all.onsuccess = () => {
      const marks = all.result
      const phrases = marks.filter((m) => m.layer === 'phrase').sort((a, b) => a.startMs - b.startMs)
      const moved = new Set([phrases[phrases.length - 1].id])
      for (const layer of ['word', 'phoneme']) {
        for (const m of marks) if (m.layer === layer && moved.has(m.parentId)) moved.add(m.id)
      }
      for (const m of marks) {
        if (moved.has(m.id)) tx.objectStore('marks').put({ ...m, voiceId: 'e2e-voice-2' })
      }
    }
  }
})`
}

async function openDemoSong(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  const match = /#\/song\/([0-9a-f-]+)$/.exec(page.url())
  if (!match?.[1]) throw new Error(`The editor URL has no song id: ${page.url()}`)
  return match[1]
}

async function bytesOf(download: Download): Promise<Buffer> {
  return readFile(await download.path())
}

test('downloads the demo song as the golden file and shows the done state', async ({ page }) => {
  await openDemoSong(page)
  await page.getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })

  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const download = await downloadEvent

  expect(download.suggestedFilename()).toBe('Silent Night.xtiming')
  expect((await bytesOf(download)).equals(await readFile(GOLDEN))).toBe(true)
  await expect(dialog.getByRole('status')).toHaveText(
    '1 timing track written to Silent Night.xtiming',
  )
  const steps = dialog.locator('details', { hasText: 'Next, in xLights' })
  await expect(steps).toHaveAttribute('open', '')
  await expect(steps.getByRole('listitem')).toHaveCount(7)
  await expect(steps.getByRole('listitem').nth(1)).toContainText(
    'It must match the frame size in this dialog: 50 ms.',
  )
})

test('downloads one file for each of two timing tracks', async ({ page }) => {
  const songId = await openDemoSong(page)
  expect(await page.evaluate(addSecondVoice(songId))).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await page.getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await dialog.getByRole('radio', { name: 'One file for each timing track' }).check()
  await expect(
    dialog.getByText(
      'The browser can block several downloads. If files are missing, allow downloads for this site, or select One file.',
    ),
  ).toBeVisible()

  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await dialog.getByRole('button', { name: 'Download' }).click()

  await expect.poll(() => downloads.length).toBe(2)
  expect(downloads.map((download) => download.suggestedFilename())).toEqual([
    'Silent Night - Lead Vocals.xtiming',
    'Silent Night - Choir.xtiming',
  ])
  for (const download of downloads) {
    const text = (await bytesOf(download)).toString('utf8')
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<timing name=')).toBe(true)
    expect(text.match(/<EffectLayer>/g)).toHaveLength(3)
  }
  await expect(dialog.getByRole('status')).toHaveText('2 timing tracks written to 2 files')
})
