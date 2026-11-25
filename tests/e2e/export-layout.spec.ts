import { expect, test, type Page } from '@playwright/test'

// The test writes voices into IndexedDB, so it needs no voice editor.
// With `moveLastPhrase`, the new voice gets the last phrase of the demo song with its words and phonemes.
// The name "Chœur" gives a warning, because the xLights import removes the letter "œ".
// The script is a string because the tsconfig of the tests has no DOM types.
function addVoice(songId: string, name: string, moveLastPhrase: boolean): string {
  return `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction(['voices', 'marks'], 'readwrite')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.objectStore('voices').put({
      id: 'e2e-voice-2', songId: ${JSON.stringify(songId)}, name: ${JSON.stringify(name)}, order: 1, color: '#4dd0e1',
    })
    if (!${String(moveLastPhrase)}) return
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

// Returns the scroll width and the client width of the dialog and of its body.
const DIALOG_WIDTHS = `(() => {
  const dialog = document.querySelector('[role="dialog"]')
  const body = dialog.querySelector('.dialog-body')
  return [dialog.scrollWidth, dialog.clientWidth, body.scrollWidth, body.clientWidth]
})()`

// Returns the count of text lines of the level tag and of the message of the first check, and their edges.
// A flex row stretches the tag to the height of the message, so the script counts the line boxes of the text.
const CHECK_ROW_LINES = `(() => {
  const tag = document.querySelector('[role="dialog"] .finding .badge')
  const message = tag.nextElementSibling
  const lines = (element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
  }
  return {
    tagText: tag.textContent,
    tagLines: lines(tag),
    messageLines: lines(message),
    tagRight: tag.getBoundingClientRect().right,
    messageLeft: message.getBoundingClientRect().left,
  }
})()`

async function expectTagOnOneLine(page: Page) {
  const row = (await page.evaluate(CHECK_ROW_LINES)) as {
    tagText: string
    tagLines: number
    messageLines: number
    tagRight: number
    messageLeft: number
  }
  expect(row.tagText).toBe('warning')
  expect(row.tagLines).toBe(1)
  expect(row.messageLeft).toBeGreaterThan(row.tagRight)
  // The warning about "Chœur" is longer than one line of the dialog at 1024 px and at 1440 px.
  expect(row.messageLines).toBeGreaterThan(1)
}

async function openDemoSongWithVoice(page: Page, name: string, moveLastPhrase: boolean) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  const match = /#\/song\/([0-9a-f-]+)$/.exec(page.url())
  if (!match?.[1]) throw new Error(`The editor URL has no song id: ${page.url()}`)
  await page.evaluate(addVoice(match[1], name, moveLastPhrase))
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await page.getByRole('button', { name: 'Export' }).click()
  return page.getByRole('dialog', { name: 'Export to xLights' })
}

async function expectNoSideScroll(page: Page) {
  const [dialogScroll, dialogClient, bodyScroll, bodyClient] = (await page.evaluate(
    DIALOG_WIDTHS,
  )) as number[]
  expect(dialogScroll).toBe(dialogClient)
  expect(bodyScroll).toBe(bodyClient)
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`fits the export dialog in its frame at ${viewport.width}x${viewport.height}, keeps the check tag on one line and shows the done line`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const dialog = await openDemoSongWithVoice(page, 'Chœur', true)
    await expect(dialog.getByText('Checks · 0 errors · 1 warning')).toBeVisible()

    await expectNoSideScroll(page)
    await dialog.getByText('Checks · 0 errors · 1 warning').click()
    await expect(dialog.locator('.finding .badge')).toBeVisible()
    await expectTagOnOneLine(page)
    await expectNoSideScroll(page)
    await dialog.getByRole('radio', { name: 'One file for each timing track' }).check()
    await expect(dialog.getByText('2 timing tracks · 2 files')).toBeVisible()
    await expectNoSideScroll(page)
    await dialog.getByRole('checkbox', { name: 'Everything as one zip file' }).check()
    await expect(dialog.getByText(/^The zip file holds/)).toBeVisible()
    await expectNoSideScroll(page)
    await dialog.getByRole('checkbox', { name: 'Everything as one zip file' }).uncheck()

    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await dialog.getByRole('button', { name: 'Download', exact: true }).click()

    const done = dialog.getByRole('status').filter({ hasText: 'written to' })
    await expect(done).toHaveText('2 timing tracks written to 2 files')
    await expect(done).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeInViewport()
    await expect.poll(() => downloads.length).toBe(2)
    await expectNoSideScroll(page)
  })
}

test('does not select a new voice with no marks, and warns when the person selects it', async ({
  page,
}) => {
  const dialog = await openDemoSongWithVoice(page, 'Voice 2', false)
  const voice = dialog.getByRole('checkbox', { name: 'Voice 2' })
  const download = dialog.getByRole('button', { name: 'Download', exact: true })
  await expect(voice).not.toBeChecked()
  await expect(download).toBeEnabled()

  await voice.check()

  await expect(dialog.getByText('Checks · 0 errors · 1 warning')).toBeVisible()
  await dialog.getByText('Checks · 0 errors · 1 warning').click()
  await expect(
    dialog.getByText('“Voice 2” has no marks. Clear its check box, or add marks.'),
  ).toBeVisible()
  await expect(download).toBeEnabled()

  await dialog.getByRole('checkbox', { name: 'Lead Vocals' }).uncheck()

  await expect(dialog.getByText('No marks to export. Select a voice with marks.')).toBeVisible()
  await expect(download).toBeDisabled()
  await expect(download).toHaveAccessibleDescription('Correct the errors in "Checks" first.')
})
