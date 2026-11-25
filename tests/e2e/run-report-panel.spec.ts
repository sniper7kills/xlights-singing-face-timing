import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture workers download no model. The transcribe fixture returns the 16 demo song words in 3 phrases.
// The singers fixture gives two singers and diagnostics with three raw groups: group 2 joins group 0.
const INIT_SCRIPT = `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  globalThis.__SINGERS_FIXTURE__ = true
`

// Words of the demo song lyrics. The copied report may hold none of them.
const LYRIC_WORDS = ['Silent', 'holy', 'calm', 'bright', 'virgin', 'Sleep']

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

function topBarAction(page: Page): Locator {
  return page.locator('.editor-top').getByRole('button', { name: 'Run report' })
}

async function transcribeWithBothOptions(page: Page) {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await dialog.getByRole('checkbox', { name: 'Separate the vocals first' }).check()
  await dialog
    .getByRole('checkbox', { name: 'Put each singer on its own voice (experimental)' })
    .check()
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has three worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/** Returns the text of each cell of each body row of a table. */
async function bodyRows(table: Locator): Promise<string[][]> {
  const rows = table.locator('tbody tr')
  const cells: string[][] = []
  for (let index = 0; index < (await rows.count()); index += 1)
    cells.push(await rows.nth(index).locator('td').allTextContents())
  return cells
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: INIT_SCRIPT })
})

test('the run report action is disabled for a song with no run', async ({ page }) => {
  await createSong(page)

  await expect(topBarAction(page)).toBeDisabled()
  await expect(topBarAction(page)).toHaveAttribute('title', 'No transcribe run for this song yet.')
})

test('the run report panel shows the singers of a run, copies the report and downloads it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await createSong(page)
  await transcribeWithBothOptions(page)
  await expect(page.getByText('16 words on 2 voices, 0 estimated')).toBeVisible()

  await page.locator('.toast').getByRole('button', { name: 'Run report' }).click()
  const panel = page.getByRole('dialog', { name: 'Run report' })
  await expect(panel).toBeVisible()
  const groups = panel.getByRole('table', { name: 'The groups straight after the clustering' })
  await expect(groups.getByRole('columnheader')).toHaveText([
    'Group',
    'Sung time',
    'Embeddings',
    'Result',
  ])
  const rows = await bodyRows(groups)
  expect(rows.map((row) => [row[0], row[2], row[3]])).toEqual([
    ['0', '3', 'Kept as singer 0'],
    ['1', '3', 'Kept as singer 1'],
    ['2', '1', 'Joined into group 0: under 3 seconds'],
  ])
  expect(rows[2]?.[1]).toBe('0.4 s')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await topBarAction(page).click()
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Copy report' }).click()
  await expect(panel.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect(panel.getByRole('status')).toHaveText('The report is on the clipboard.')
  const copied = String(await page.evaluate('navigator.clipboard.readText()'))
  expect(copied).toContain('[Singers]\nStep: split\n')
  expect(copied).toContain('Raw groups: 3')
  for (const word of LYRIC_WORDS) expect(copied).not.toContain(word)

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download report' }).click()
  expect((await download).suggestedFilename()).toBe('silent-night - run report.txt')
})
