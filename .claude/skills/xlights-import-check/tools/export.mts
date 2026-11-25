// Writes the app exports for the xLights import check, with the functions of src/lib/xtiming.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Run from the root of the repository.
const WT = process.cwd()
const OUT = process.argv[2]
const { buildTracks } = await import(`${WT}/src/lib/xtiming/buildTracks.ts`)
const { exportFiles } = await import(`${WT}/src/lib/xtiming/exportFiles.ts`)

const demo = JSON.parse(readFileSync(`${WT}/public/demo/silent-night.marks.json`, 'utf8'))
const song = { id: 'song-1', ...demo.song, createdAt: '', updatedAt: '' }
const voices = [
  { id: 'lead', songId: 'song-1', name: 'Lead', order: 0, color: '#f00' },
  { id: 'chorus', songId: 'song-1', name: 'Chorus', order: 1, color: '#0f0' },
]
// phrase-2 and its words and phonemes go to the voice "Chorus". The other phrases stay on "Lead".
const marks = demo.marks.map((m: { id: string }) => ({
  ...m,
  voiceId: m.id.startsWith('phrase-2') ? 'chorus' : 'lead',
}))
const options = {
  voiceIds: ['lead', 'chorus'],
  grouping: 'voice',
  packaging: 'one-file',
  writeRest: false,
  trackNames: {},
}
mkdirSync(OUT, { recursive: true })
const write = (files: { name: string; text: string }[]) => {
  for (const f of files) {
    writeFileSync(join(OUT, f.name), f.text, 'utf8')
    console.log('wrote', f.name)
  }
}
const tracks = buildTracks(song, voices, [], marks, options)
write(exportFiles(tracks, 'Silent Night', 'one-file'))
write(exportFiles(tracks, 'Silent Night', 'file-per-track'))

// A third export: labels with each of & < > " ' and a timing track name with the same characters.
const special = demo.marks.map((m: { id: string; label: string }) => {
  const labels: Record<string, string> = {
    'phrase-1': `Tom & "Jerry's" <3 > café`,
    'phrase-1-word-1': '&',
    'phrase-1-word-2': '<night>',
    'phrase-1-word-3': '"holy"',
    'phrase-1-word-4': "night's",
  }
  return { ...m, voiceId: 'lead', label: labels[m.id] ?? m.label }
})
const specialTracks = buildTracks(song, [voices[0]], [], special, {
  ...options,
  voiceIds: ['lead'],
  trackNames: { lead: `Lead & "Co" <café>` },
})
write(exportFiles(specialTracks, 'Special Labels', 'one-file'))
