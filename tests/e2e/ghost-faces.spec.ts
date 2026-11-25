import { expect, type Page, test } from '@playwright/test'

// The demo song has one voice, "Lead Vocals". "Voice 2" gets two phrases from a "Lyrics only" run.

function rail(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' })
}

function voiceButton(page: Page, name: string) {
  return rail(page).getByRole('button', { name, exact: true })
}

function ghostBars(page: Page) {
  return page.getByRole('list', { name: 'Other voices', exact: true }).getByRole('listitem')
}

function faceNames(page: Page) {
  return page.getByRole('complementary', { name: 'Inspector' }).locator('.face-caption span')
}

test('shows a face for each unmuted voice and the phrases of the other voice on the ghost row', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(faceNames(page)).toHaveText(['Lead Vocals'])

  await rail(page).getByRole('button', { name: 'Add voice' }).click()
  await expect(faceNames(page)).toHaveText(['Lead Vocals', 'Voice 2'])
  await expect(ghostBars(page)).toHaveCount(0)

  await voiceButton(page, 'Voice 2').click()
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByLabel('Lyrics (optional)').fill('Silent night\nHoly night')
  await dialog.getByLabel('Lyrics only').check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  await expect(dialog).toBeHidden()

  // The layers show "Voice 2", so the ghost row shows the 3 phrases of "Lead Vocals".
  await expect(ghostBars(page)).toHaveCount(3)
  await voiceButton(page, 'Lead Vocals').click()
  await expect(ghostBars(page)).toHaveCount(2)
  await expect(ghostBars(page).first()).toHaveText('Voice 2: Silent night')
  // "Voice 2" gets the second colour, Sky.
  await expect(ghostBars(page).first()).toHaveCSS('background-color', 'rgb(76, 201, 240)')

  await rail(page).getByRole('button', { name: 'Actions for Voice 2', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Pink' }).click()
  // Pink is #f472b6. The chip and every bar show it.
  const pink = 'rgb(244, 114, 182)'
  await expect(voiceButton(page, 'Voice 2').locator('.voice-chip')).toHaveCSS(
    'background-color',
    pink,
  )
  for (const bar of await ghostBars(page).all())
    await expect(bar).toHaveCSS('background-color', pink)

  const mute = rail(page).getByRole('button', { name: 'Mute face preview of Voice 2' })
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(faceNames(page)).toHaveText(['Lead Vocals'])

  await expect(page.locator('.save-state')).toHaveText('Saved')
  await page.reload()
  await expect(faceNames(page)).toHaveText(['Lead Vocals'])
  await expect(
    rail(page).getByRole('button', { name: 'Mute face preview of Voice 2' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
