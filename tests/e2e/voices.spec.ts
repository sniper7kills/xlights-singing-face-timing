import { expect, type Page, test } from '@playwright/test'

// The demo song has one voice, "Lead Vocals", with 3 phrases.

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
}

function rail(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' })
}

/** Returns the select button of a voice row. Its accessible name is the voice name only. */
function voiceButton(page: Page, name: string) {
  return rail(page).getByRole('button', { name, exact: true })
}

async function menuItem(page: Page, voice: string, item: string) {
  await rail(page)
    .getByRole('button', { name: `Actions for ${voice}`, exact: true })
    .click()
  await rail(page)
    .getByRole('menu', { name: `Actions for ${voice}` })
    .getByRole('menuitem', { name: item, exact: true })
    .click()
}

async function addSecondVoice(page: Page) {
  await rail(page).getByRole('button', { name: 'Add voice' }).click()
  await expect(voiceButton(page, 'Voice 2')).toBeVisible()
}

test('adds "Voice 2" to the demo song and shows each voice on the layers after a click', async ({
  page,
}) => {
  await openDemoSong(page)
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAttribute('aria-pressed', 'true')
  await expect(voiceButton(page, 'Lead Vocals')).toHaveAccessibleDescription('3 phrases')

  await addSecondVoice(page)
  await expect(rail(page).getByRole('listitem')).toHaveCount(2)
  await expect(voiceButton(page, 'Voice 2')).toHaveAccessibleDescription('0 phrases')

  const layers = page.getByRole('region', { name: 'Layers' })
  await voiceButton(page, 'Voice 2').click()
  await expect(voiceButton(page, 'Voice 2')).toHaveAttribute('aria-pressed', 'true')
  await expect(layers.getByText('No marks yet. Select Transcribe to find the words.')).toBeVisible()

  await voiceButton(page, 'Lead Vocals').click()
  await expect(page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')).toHaveCount(3)
})

test('keeps a renamed voice after a reload', async ({ page }) => {
  await openDemoSong(page)
  await addSecondVoice(page)

  await menuItem(page, 'Voice 2', 'Rename')
  const field = rail(page).getByRole('textbox', { name: 'Voice name' })
  await field.fill('Santa')
  await field.press('Enter')
  await expect(voiceButton(page, 'Santa')).toBeVisible()

  await expect(page.locator('.save-state')).toHaveText('Saved')
  await page.reload()
  await expect(voiceButton(page, 'Santa')).toBeVisible()
})

test('shows a changed colour on the chip of the row', async ({ page }) => {
  await openDemoSong(page)

  await menuItem(page, 'Lead Vocals', 'Colour')
  await rail(page).getByRole('menuitemradio', { name: 'Sky' }).click()

  await expect(voiceButton(page, 'Lead Vocals').locator('.voice-chip')).toHaveCSS(
    'background-color',
    'rgb(76, 201, 240)',
  )
})

test('makes the second voice the first with "Move up"', async ({ page }) => {
  await openDemoSong(page)
  await addSecondVoice(page)

  await menuItem(page, 'Voice 2', 'Move up')

  await expect(rail(page).getByRole('listitem').first()).toContainText('Voice 2')
  await expect(rail(page).getByRole('listitem').last()).toContainText('Lead Vocals')
})

test('deletes a voice after the confirm dialog, and Ctrl+Z restores it with its marks', async ({
  page,
}) => {
  await openDemoSong(page)
  await addSecondVoice(page)

  await menuItem(page, 'Lead Vocals', 'Delete')
  const dialog = page.getByRole('dialog', { name: 'The app deletes “Lead Vocals” and its marks.' })
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(voiceButton(page, 'Lead Vocals')).toHaveCount(0)
  await expect(rail(page).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Phrases' })).toHaveCount(0)

  await page.keyboard.press('Control+z')

  await expect(voiceButton(page, 'Lead Vocals')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Words' }).getByRole('listitem')).toHaveCount(16)
})
