import { readFile } from 'node:fs/promises'
import { expect, type Locator, type Page, test } from '@playwright/test'

// The fixture workers download no model. The separate fixture returns the mono mix as the vocals.
// The split fixture gives the first singer track the first 60% of the vocals and the second track the last 60%,
// with the rest of each track at 0. The transcribe fixture gives no word where the audio is 0.
// So the voice "Female" gets the words up to about 17 s, and the voice "Male" gets the words from about 12 s.
// The test sets the WebGPU check of the split, because headless Chromium can have no WebGPU adapter.
// The E2E tests compile with no DOM types, so the scripts are strings.
function initScript(webgpu: boolean): string {
  return `
  globalThis.__TRANSCRIBE_FIXTURE__ = true
  globalThis.__SEPARATE_FIXTURE__ = true
  globalThis.__SPLIT_FIXTURE__ = true
  globalThis.__SPLIT_WEBGPU__ = ${String(webgpu)}
  const log = []
  globalThis.__progressLog = log
  new MutationObserver(() => {
    const text = document.querySelector('.transcribe-progress')?.textContent ?? ''
    if (text !== '' && log.at(-1) !== text) log.push(text)
  }).observe(document, { subtree: true, childList: true, characterData: true })
`
}

const SEPARATE = 'Separate the vocals first'
const SPLIT = 'Split the singers (experimental)'
const NO_WEBGPU = 'This browser has no WebGPU. The singer split needs it.'

async function createSong(page: Page) {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles('public/demo/silent-night.ogg')
  await expect(page.getByRole('heading', { level: 2, name: 'silent-night' })).toBeVisible()
}

async function openDialog(page: Page): Promise<Locator> {
  await page.locator('.editor-top').getByRole('button', { name: 'Transcribe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transcribe' })
  await expect(dialog.getByRole('checkbox', { name: SPLIT })).toBeVisible()
  return dialog
}

function voiceRows(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Voices' }).getByRole('listitem')
}

/** Returns the requests for a file of the split worker. */
function watchSplitRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/split/i.test(new URL(request.url()).pathname)) urls.push(request.url())
  })
  return urls
}

async function progressLog(page: Page): Promise<string[]> {
  const log: unknown = await page.evaluate('globalThis.__progressLog')
  if (!Array.isArray(log)) throw new Error('The progress log is missing.')
  return log.filter((text): text is string => typeof text === 'string')
}

type Phrase = { startMs: number; endMs: number }

/** Returns the phrases of each timing track of an export file: the effects of the first EffectLayer. */
function phrasesOfTracks(xml: string): Map<string, Phrase[]> {
  const tracks = new Map<string, Phrase[]>()
  for (const match of xml.matchAll(/<timing name="([^"]*)"[\s\S]*?<\/timing>/g)) {
    const firstLayer = /<EffectLayer>([\s\S]*?)<\/EffectLayer>/.exec(match[0])?.[1] ?? ''
    const phrases = [...firstLayer.matchAll(/starttime="(\d+)" endtime="(\d+)"/g)].map((times) => ({
      startMs: Number(times[1]),
      endMs: Number(times[2]),
    }))
    tracks.set(match[1] ?? '', phrases)
  }
  return tracks
}

async function runSplit(page: Page) {
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  await dialog.getByRole('checkbox', { name: SPLIT }).check()
  await expect(dialog.getByRole('radio', { name: 'Male and female' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Start' }).click()
  // The run has four worker steps, so it takes longer than the default timeout.
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

test('a run with the option off gives one voice and requests no file of the split worker', async ({
  page,
}) => {
  await page.addInitScript({ content: initScript(true) })
  const splitRequests = watchSplitRequests(page)
  await createSong(page)
  const dialog = await openDialog(page)
  await expect(dialog.getByRole('checkbox', { name: SPLIT })).not.toBeChecked()

  await dialog.getByRole('button', { name: 'Start' }).click()

  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByText('16 words, 0 estimated')).toBeVisible()
  await expect(voiceRows(page)).toHaveCount(1)
  expect(splitRequests).toEqual([])
})

test('a run with the option on gives two voices whose phrases overlap, and one undo and one redo', async ({
  page,
}) => {
  await page.addInitScript({ content: initScript(true) })
  await runSplit(page)

  await expect(page.getByText(/\d+ words on 2 voices, 0 estimated/)).toBeVisible()
  await expect(voiceRows(page)).toHaveCount(3)
  const rail = page.getByRole('complementary', { name: 'Voices' })
  await expect(rail.getByRole('button', { name: 'Female', exact: true })).toBeVisible()
  await expect(rail.getByRole('button', { name: 'Male', exact: true })).toBeVisible()
  expect((await progressLog(page)).some((text) => /^Splitting the singers, \d+%$/.test(text))).toBe(
    true,
  )
  // "Keep the separated tracks" is on by default, so each singer track is a track row.
  const trackGroup = page.getByRole('group', { name: 'Audio tracks' })
  await expect(trackGroup.getByRole('button', { name: 'Solo Female' })).toBeVisible()
  await expect(trackGroup.getByRole('button', { name: 'Solo Male' })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+z')
  await expect(voiceRows(page)).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+Z')
  await expect(voiceRows(page)).toHaveCount(3)

  await page.getByRole('button', { name: 'Export' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export to xLights' })
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const xml = (await readFile(await (await downloadEvent).path())).toString('utf8')

  const tracks = phrasesOfTracks(xml)
  for (const name of tracks.keys()) {
    const track = new RegExp(`<timing name="${name}"[\\s\\S]*?</timing>`).exec(xml)?.[0] ?? ''
    expect(track.match(/<EffectLayer>/g)).toHaveLength(3)
  }
  const female = tracks.get('Female') ?? []
  const male = tracks.get('Male') ?? []
  expect(female.length).toBeGreaterThan(0)
  expect(male.length).toBeGreaterThan(0)
  const overlaps = female.some((a) => male.some((b) => a.startMs < b.endMs && b.startMs < a.endMs))
  expect(overlaps).toBe(true)
})

test('without WebGPU, the option is disabled and a keyboard user reaches it with its reason', async ({
  page,
}) => {
  await page.addInitScript({ content: initScript(false) })
  await createSong(page)
  const dialog = await openDialog(page)
  await dialog.getByRole('checkbox', { name: SEPARATE }).check()
  const split = dialog.getByRole('checkbox', { name: SPLIT })

  await split.focus()
  await page.keyboard.press('Space')

  await expect(split).toBeFocused()
  await expect(split).toBeDisabled()
  await expect(split).not.toBeChecked()
  await expect(split).toHaveAccessibleDescription(new RegExp(`^${NO_WEBGPU}`))
  await expect(dialog.getByText(NO_WEBGPU)).toBeVisible()
})
