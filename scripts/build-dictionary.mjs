// Converts vendor/cmudict/cmudict.dict into public/dict/cmudict.json.
// Run it from the repository root: node scripts/build-dictionary.mjs
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
// Node removes the TypeScript types on import, so the app and this script share one parser.
import { buildDictionaryJson } from '../src/lib/dictionary/buildDictionary.ts'

const SOURCE = 'vendor/cmudict/cmudict.dict'
const OUTPUT = 'public/dict/cmudict.json'

const json = buildDictionaryJson(readFileSync(SOURCE, 'utf8'))
writeFileSync(OUTPUT, json)
// The BSD licence of the dictionary requires its notice beside each copy that the app serves.
copyFileSync('vendor/cmudict/LICENSE', 'public/dict/cmudict-LICENSE.txt')

const raw = Buffer.byteLength(json)
const gzip = gzipSync(json, { level: 9 }).byteLength
const words = Object.keys(JSON.parse(json)).length
console.log(`${OUTPUT}: ${words} words, ${raw} bytes, ${gzip} bytes with gzip`)
