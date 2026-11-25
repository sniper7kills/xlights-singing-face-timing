import { expect, test } from '@playwright/test'

// The app has no mark editor yet, so the test deletes the phonemes of the first word in IndexedDB.
// The script is a string because the tsconfig of the tests has no DOM types. It resolves to the word label.
const REMOVE_FIRST_WORD_PHONEMES = `new Promise((resolve, reject) => {
  const open = indexedDB.open('singing-face-timing')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction(['marks'], 'readwrite')
    let label
    tx.oncomplete = () => resolve(label)
    tx.onerror = () => reject(tx.error)
    const all = tx.objectStore('marks').getAll()
    all.onsuccess = () => {
      const marks = all.result
      const [word] = marks.filter((m) => m.layer === 'word').sort((a, b) => a.startMs - b.startMs)
      label = word.label
      for (const m of marks) {
        if (m.layer === 'phoneme' && m.parentId === word.id) tx.objectStore('marks').delete(m.id)
      }
    }
  }
})`

test('opens the export dialog of the demo song with one timing track and a file preview', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()

  await page.getByRole('button', { name: 'Export' }).click()

  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Frame size: 50 ms')).toBeVisible()
  const names = dialog.getByRole('textbox', { name: 'Name of the timing track for Lead Vocals' })
  await expect(names).toHaveCount(1)
  await expect(names).toHaveValue('Lead Vocals')
  const preview = dialog.getByLabel('File preview')
  const text = (await preview.textContent()) ?? ''
  expect(text.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
  expect(text).toContain('<timing name="Lead Vocals"')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export' })).toBeFocused()
})

test('selects the mark of a finding on the layer after a click on the finding', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  const label = String(await page.evaluate(REMOVE_FIRST_WORD_PHONEMES))
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  const word = page.getByRole('list', { name: 'Words' }).getByRole('listitem').first()
  await expect(word).toHaveText(label)
  await expect(word).not.toHaveAttribute('aria-current')

  await page.getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await dialog.getByText('Checks · 0 errors · 1 warning').click()
  await dialog.getByRole('button', { name: /has no phoneme\.$/ }).click()

  await expect(dialog).toHaveCount(0)
  await expect(word).toHaveAttribute('aria-current', 'true')
  await expect(word).toHaveCSS('outline-style', 'solid')
  await expect(word).toHaveCSS('outline-width', '2px')
})

test('shows no "has no phoneme" warning for the words of a transcribe run', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(globalThis, { __TRANSCRIBE_FIXTURE__: true })
  })
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  const top = page.locator('.editor-top')
  await top.getByRole('button', { name: 'Transcribe' }).click()
  const transcribeDialog = page.getByRole('dialog', { name: 'Transcribe' })
  await transcribeDialog.getByRole('button', { name: 'Start' }).click()
  // A busy test computer can take more than 5 seconds for the run and the write of its marks.
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible({ timeout: 20_000 })
  await expect(
    page.getByRole('list', { name: 'Phonemes' }).getByRole('listitem').first(),
  ).toBeVisible({ timeout: 20_000 })

  await top.getByRole('button', { name: 'Export' }).click()

  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  // The dialog reads the song from the store before it shows the checks.
  await expect(dialog.getByText(/^Checks · 0 errors · /)).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByText(/has no phoneme\.$/)).toHaveCount(0)
  expect(await dialog.getByLabel('File preview').textContent()).toContain('<Effect label="')
})

test('warns about a voice name with an accented letter and still downloads', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  const rail = page.getByRole('complementary', { name: 'Voices' })
  await rail.getByRole('button', { name: 'Actions for Lead Vocals', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const field = rail.getByRole('textbox', { name: 'Voice name' })
  await field.fill('Noël')
  await expect(rail.getByText('xLights shows this name as “Nol”.')).toBeVisible()
  await field.press('Enter')
  await expect(rail.getByRole('button', { name: 'Noël', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  await dialog.getByText('Checks · 0 errors · 1 warning').click()
  await expect(
    dialog.getByText(
      'xLights shows the timing track “Noël” as “Nol”. xLights removes = < > & " \' and characters that are not ASCII from a name.',
    ),
  ).toBeVisible()

  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('Silent Night.xtiming')
  await expect(dialog.getByRole('status')).toHaveText(
    '1 timing track written to Silent Night.xtiming',
  )
})
