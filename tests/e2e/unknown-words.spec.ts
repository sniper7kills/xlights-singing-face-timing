import { expect, type Page, test } from '@playwright/test'

// "Zxqv" is in no dictionary, so the break down guesses its phonemes and marks it unknown.
const LYRICS = 'Silent night, Zxqv night'

function toolbar(page: Page) {
  return page.getByRole('toolbar', { name: 'Editor tools' })
}

function word(page: Page, label: string) {
  return page.getByRole('list', { name: 'Words' }).getByRole('listitem').filter({ hasText: label })
}

test('shows an unknown word with a dotted border, selects it from the counter, and removes the state after a custom entry', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()

  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const transcribe = page.getByRole('dialog', { name: 'Transcribe' })
  await transcribe.getByLabel('Lyrics (optional)').fill(LYRICS)
  await transcribe.getByLabel('Lyrics only').check()
  await transcribe.getByRole('button', { name: 'Start' }).click()
  await expect(transcribe).toBeHidden()

  const counter = toolbar(page).getByRole('button', { name: '1 unknown word' })
  await expect(counter).toBeVisible()
  const zxqv = word(page, 'Zxqv')
  await expect(zxqv).toHaveAttribute('data-unknown', 'true')
  await expect(zxqv).toHaveCSS('border-top-style', 'dotted')
  await expect(word(page, 'Silent')).not.toHaveAttribute('data-unknown')
  await expect(word(page, 'Silent')).toHaveCSS('border-top-style', 'solid')

  await counter.click()
  await expect(zxqv).toHaveAttribute('aria-current', 'true')
  await expect(zxqv).toHaveCSS('border-top-style', 'dotted')

  await toolbar(page).getByRole('button', { name: 'Add to custom dictionary' }).click()
  const dictionary = page.getByRole('dialog', { name: 'Custom dictionary' })
  await expect(dictionary.getByRole('textbox', { name: 'Word', exact: true })).toHaveValue('ZXQV')
  await expect(dictionary.getByRole('textbox', { name: 'CMU symbols' })).toBeFocused()
  await page.keyboard.type('Z IH1 K S K W IH0 V')
  await dictionary.getByRole('button', { name: 'Add entry' }).click()
  await expect(
    dictionary.getByRole('table', { name: 'Custom words' }).getByRole('row', { name: 'ZXQV' }),
  ).toBeVisible()

  await expect(zxqv).not.toHaveAttribute('data-unknown')
  await expect(toolbar(page).getByRole('button', { name: /unknown word/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dictionary).toBeHidden()
  // The save removed the button that opened the dialog, so the focus goes to the selected word.
  await expect(zxqv).toBeFocused()
  await expect(page.locator('body')).not.toBeFocused()
  await expect(zxqv).toHaveCSS('border-top-style', 'solid')

  await expect(page.locator('.save-state')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
  await expect(word(page, 'Zxqv')).toBeVisible()
  await expect(word(page, 'Zxqv')).not.toHaveAttribute('data-unknown')
  await expect(toolbar(page).getByRole('button', { name: /unknown word/ })).toHaveCount(0)
})
