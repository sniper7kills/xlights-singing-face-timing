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
  // The menu is in a portal at the end of the page, outside the rail.
  await page
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
  await expect(page.getByRole('heading', { name: 'Voice: Voice 2' })).toBeVisible()
  await expect(
    layers.getByText(
      'This voice has no marks. Select phrases of a different voice, then select "Phrase" and "Move to voice". Or select "Transcribe".',
    ),
  ).toBeVisible()

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
  await page.getByRole('menuitemradio', { name: 'Sky' }).click()

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

test('numbers the rows of 12 voices, names the shown voice above the layers and marks its row', async ({
  page,
}) => {
  await openDemoSong(page)
  const hint = rail(page).getByText(
    'Use one voice for each group of face models that sing together.',
  )
  await expect(hint).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Voice: Lead Vocals' })).toBeVisible()

  const add = rail(page).getByRole('button', { name: 'Add voice' })
  for (let n = 2; n <= 12; n += 1) {
    await add.click()
    await expect(rail(page).getByRole('listitem')).toHaveCount(n)
  }
  await expect(hint).toBeVisible()
  await expect(rail(page).locator('.voice-number')).toHaveText(
    Array.from({ length: 12 }, (_, index) => String(index + 1)),
  )
  await expect(voiceButton(page, 'Voice 10')).toHaveAttribute('title', 'Voice 10')
  const colours = await rail(page)
    .locator('.voice-select .voice-chip')
    .evaluateAll((chips) => chips.map((chip) => chip.getAttribute('style')))
  expect(new Set(colours).size).toBe(12)

  await voiceButton(page, 'Voice 10').click()
  await expect(page.getByRole('heading', { name: 'Voice: Voice 10' })).toBeVisible()
  await expect(rail(page).getByRole('listitem').nth(9)).toHaveAttribute('aria-current', 'true')
  await expect(rail(page).locator('[aria-current="true"]')).toHaveCount(1)
})
