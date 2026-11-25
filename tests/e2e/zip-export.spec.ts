import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

const DEMO_AUDIO = new URL('../../public/demo/silent-night.ogg', import.meta.url)

type ZipEntry = { name: string; data: Buffer }

// A minimal reader: the end of central directory record, then each central directory header
// and its local header (PKWARE APPNOTE 6.3.10, sections 4.3.7, 4.3.12 and 4.3.16). Stored entries only.
function readZip(zip: Buffer): ZipEntry[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50)
    expect(zip.readUInt16LE(at + 10)).toBe(0)
    const size = zip.readUInt32LE(at + 24)
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    entries.push({ name, data: zip.subarray(dataStart, dataStart + size) })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function openDemoExport(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo song' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Silent Night' })).toBeVisible()
  await page.getByRole('button', { name: 'Export' }).click()
  return page.getByRole('dialog', { name: 'Export to xLights' })
}

function hasUnzip(): boolean {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function bytesOf(download: Download): Promise<Buffer> {
  return readFile(await download.path())
}

test('downloads the demo song as one zip file with the timing file, the audio and the song data', async ({
  page,
}) => {
  const dialog = await openDemoExport(page)

  const normalEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const normal = await bytesOf(await normalEvent)

  await dialog.getByRole('checkbox', { name: 'Everything as one zip file' }).check()
  await expect(
    dialog.getByText(
      /^The zip file holds 5 files: timing\/Silent Night\.xtiming, audio\/silent-night\.ogg, song\.json, lyrics\.txt, README\.txt\. Size: \d+ KB\.$/,
    ),
  ).toBeVisible()

  const zipEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download zip' }).click()
  const zipDownload = await zipEvent

  expect(zipDownload.suggestedFilename()).toBe('Silent Night.zip')
  const entries = readZip(await bytesOf(zipDownload))
  expect(entries.map((entry) => entry.name)).toEqual([
    'timing/Silent Night.xtiming',
    'audio/silent-night.ogg',
    'song.json',
    'lyrics.txt',
    'README.txt',
  ])
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]))
  expect(byName.get('timing/Silent Night.xtiming')?.equals(normal)).toBe(true)
  const audio = byName.get('audio/silent-night.ogg')
  expect(audio?.length).toBe(350_346)
  expect(audio?.equals(await readFile(DEMO_AUDIO))).toBe(true)
  const song = JSON.parse(byName.get('song.json')?.toString('utf8') ?? '') as {
    version: number
    song: { name: string }
  }
  expect(song.version).toBe(1)
  expect(song.song.name).toBe('Silent Night')
  expect(byName.get('README.txt')?.toString('utf8')).toContain('- audio/silent-night.ogg:')
  expect(byName.get('README.txt')?.toString('utf8')).not.toMatch(/dialog/i)
  await expect(dialog.getByRole('status')).toHaveText('1 timing track written to Silent Night.zip')

  // CI runs on ubuntu-latest, which has unzip. The check also runs on each machine with unzip on PATH.
  if (hasUnzip()) {
    const report = execFileSync('unzip', ['-t', await zipDownload.path()], { encoding: 'utf8' })
    expect(report).toContain('No errors detected')
  }
})
