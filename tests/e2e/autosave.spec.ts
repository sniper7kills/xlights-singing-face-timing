import { expect, type Page, test } from '@playwright/test'

// The demo song has one voice, "Lead Vocals". Each "Add voice" is one change of the song.
const EDITS = 10

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.locator('.save-state')).toHaveText('Saved')
}

function voiceRows(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' }).getByRole('listitem')
}

/** Adds EDITS voices with 100 ms between the clicks, and waits until the rail shows each voice. */
async function addVoicesInBurst(page: Page) {
  const add = page.getByRole('complementary', { name: 'Voices' }).getByRole('button', {
    name: 'Add voice',
  })
  for (let edit = 0; edit < EDITS; edit += 1) {
    await add.click()
    await page.waitForTimeout(100)
  }
  await expect(voiceRows(page)).toHaveCount(EDITS + 1)
}

/** Records each dialog of the page and accepts it, so that a reload can continue. */
function acceptDialogs(page: Page) {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type())
    void dialog.accept()
  })
  return dialogs
}

test('keeps a burst of edits after a reload 300 ms later, or asks before the reload', async ({
  page,
}) => {
  const dialogs = acceptDialogs(page)
  await openDemoSong(page)
  await addVoicesInBurst(page)

  await page.waitForTimeout(300)
  await page.reload()

  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(page.locator('.save-state')).toHaveText('Saved')
  const kept = (await voiceRows(page).count()) - 1
  test.info().annotations.push({
    type: 'result',
    description: `dialogs: ${dialogs.join(',') || 'none'}; edits kept: ${kept} of ${EDITS}`,
  })
  expect(dialogs.includes('beforeunload') || kept === EDITS).toBe(true)
})

test('keeps all edits of a burst after a reload 2.5 seconds later, with no question', async ({
  page,
}) => {
  const dialogs = acceptDialogs(page)
  await openDemoSong(page)
  await addVoicesInBurst(page)

  await page.waitForTimeout(2500)
  await page.reload()

  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(voiceRows(page)).toHaveCount(EDITS + 1)
  expect(dialogs).toEqual([])
})

test('reloads with no question when all changes are saved', async ({ page }) => {
  const dialogs = acceptDialogs(page)
  await openDemoSong(page)
  await page.getByRole('complementary', { name: 'Voices' }).getByRole('button', { name: 'Add voice' }).click()
  await expect(page.locator('.save-state')).toHaveText('Saved')

  await page.reload()

  await expect(voiceRows(page)).toHaveCount(2)
  expect(dialogs).toEqual([])
})
