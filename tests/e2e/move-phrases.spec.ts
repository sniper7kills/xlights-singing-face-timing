import { expect, type Page, test } from '@playwright/test'

// The demo song has one voice, "Lead Vocals", with 3 phrases.
// The first phrase starts at 100 ms. The second phrase holds the word "calm".

async function openDemoSong(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
}

function rail(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' })
}

function voiceButton(page: Page, name: string) {
  return rail(page).getByRole('button', { name, exact: true })
}

function phrases(page: Page) {
  return page.getByRole('list', { name: 'Phrases' }).getByRole('listitem')
}

function phrase(page: Page, label: string) {
  // The tooltip of a mark is the label, then the start and the end on a second line.
  return phrases(page).and(page.getByTitle(new RegExp(`^${label}\\n`)))
}

function word(page: Page, label: string) {
  return page
    .getByRole('list', { name: 'Words' })
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}$`) })
}

function fields(page: Page, layer: 'phrase' | 'word') {
  return page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('region', { name: `Selected ${layer}` })
}

/** Selects "Move to voice" or "Copy to voice" in the phrase menu, then the target voice. */
async function transfer(page: Page, mode: 'Move to voice' | 'Copy to voice', target: string) {
  await page.getByRole('button', { name: 'Phrase', exact: true }).click()
  await page.getByRole('menuitem', { name: mode, exact: true }).click()
  await page
    .getByRole('menu', { name: mode })
    .getByRole('menuitem', { name: target, exact: true })
    .click()
}

test('moves a phrase to another voice at the same start time', async ({ page }) => {
  await openDemoSong(page)
  await rail(page).getByRole('button', { name: 'Add voice' }).click()
  await expect(voiceButton(page, 'Voice 2')).toBeVisible()

  await phrase(page, 'Silent night, holy night').click()
  await expect(
    fields(page, 'phrase').getByRole('textbox', { name: 'Start', exact: true }),
  ).toHaveValue('0:00.100')
  await transfer(page, 'Move to voice', 'Voice 2')

  await expect(phrases(page)).toHaveCount(2)
  await expect(phrase(page, 'Silent night, holy night')).toHaveCount(0)
  await expect(voiceButton(page, 'Voice 2')).toHaveAccessibleDescription('1 phrase')

  await voiceButton(page, 'Voice 2').click()
  await phrase(page, 'Silent night, holy night').click()
  await expect(
    fields(page, 'phrase').getByRole('textbox', { name: 'Start', exact: true }),
  ).toHaveValue('0:00.100')
  await expect(word(page, 'holy')).toHaveCount(1)
})

test('copies a phrase, keeps the copies apart, and asks before a replace', async ({ page }) => {
  await openDemoSong(page)
  await phrase(page, 'All is calm, all is bright').click()
  await transfer(page, 'Copy to voice', 'New voice')

  await expect(voiceButton(page, 'Voice 2')).toHaveAccessibleDescription('1 phrase')
  await expect(phrases(page)).toHaveCount(3)

  await voiceButton(page, 'Voice 2').click()
  await word(page, 'calm').click()
  const label = fields(page, 'word').getByRole('textbox', { name: 'Label', exact: true })
  await label.fill('warm')
  await label.press('Enter')
  await expect(word(page, 'warm')).toHaveCount(1)

  await voiceButton(page, 'Lead Vocals').click()
  await expect(word(page, 'calm')).toHaveCount(1)
  await expect(word(page, 'warm')).toHaveCount(0)

  await phrase(page, 'All is calm, all is bright').click()
  await transfer(page, 'Copy to voice', 'Voice 2')
  const dialog = page.getByRole('dialog', {
    name: 'Voice 2 has 1 phrase in this range. Replace it?',
  })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect(dialog).toHaveCount(0)
  await expect(voiceButton(page, 'Voice 2')).toHaveAccessibleDescription('1 phrase')
  await voiceButton(page, 'Voice 2').click()
  await expect(word(page, 'warm')).toHaveCount(1)
})
