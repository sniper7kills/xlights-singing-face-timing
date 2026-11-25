import { expect, type Page, test } from '@playwright/test'

const NOTICE =
  'This song is open in a different tab. The tab that saves last keeps its version. Close one of the tabs.'

function voiceRows(page: Page) {
  return page.getByRole('complementary', { name: 'Voices' }).getByRole('listitem')
}

async function addVoiceAndSave(page: Page) {
  await page
    .getByRole('complementary', { name: 'Voices' })
    .getByRole('button', { name: 'Add voice' })
    .click()
  await expect(page.locator('.save-state')).toHaveText('Saved')
}

test('shows the notice of a different tab at 1024 px, and the tab that saves last keeps its version', async ({
  context,
}) => {
  const tabA = await context.newPage()
  await tabA.setViewportSize({ width: 1024, height: 768 })
  await tabA.goto('/')
  await tabA.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(tabA.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(tabA.locator('.save-state')).toHaveText('Saved')

  const tabB = await context.newPage()
  await tabB.setViewportSize({ width: 1440, height: 900 })
  await tabB.goto(tabA.url())
  await expect(tabB.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await addVoiceAndSave(tabB)
  await addVoiceAndSave(tabB)
  await expect(voiceRows(tabB)).toHaveCount(3)

  // Both side panels are folded at 1024 px, and the notice must fit and stay on top.
  const notice = tabA.getByRole('alert').filter({ hasText: NOTICE })
  await expect(notice).toBeVisible()
  const box = await notice.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(1024)
  const onTop: unknown = await tabA.evaluate(
    `(() => {
      const notice = document.elementFromPoint(${box.x + box.width / 2}, ${box.y + box.height / 2})
      return notice?.closest('[role="alert"]')?.textContent?.includes('different tab') ?? false
    })()`,
  )
  expect(onTop).toBe(true)

  // Tab A still shows its own version: one voice. Its next save replaces the two voices of tab B.
  await tabA.getByRole('button', { name: 'Voices', exact: true }).click()
  await addVoiceAndSave(tabA)
  await notice.getByRole('button', { name: 'Close' }).click()
  await expect(notice).toBeHidden()

  await tabB.reload()
  await expect(tabB.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await expect(voiceRows(tabB)).toHaveCount(2)
})
