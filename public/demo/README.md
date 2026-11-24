# Demo song

This folder holds the demo song and its expected marks. The E2E tests and the
"Try the demo song" button will use these files. Issue #13 adds the button.

| File | Content |
|---|---|
| `silent-night.ogg` | The audio clip. Ogg Vorbis, 44.1 kHz, stereo, 28.9 seconds, about 350 kB. |
| `silent-night.marks.json` | The phrases, the words and the phonemes of the clip for one voice, "Lead Vocals". |

## Source

- Title: "Silent Night", track 18 of 27 on the 2010 album *Christmas With The
  Chorus*.
- Performer: United States Army Chorus.
- Composer: Franz Xaver Gruber. Lyricist: Joseph Mohr.
- Page: https://commons.wikimedia.org/wiki/File:Silent_Night_(choral).ogg
- File: https://upload.wikimedia.org/wikipedia/commons/a/a0/Silent_Night_%28choral%29.ogg
- Retrieved: 2026-11-24.

## Licence

The licence statement on the page, quoted verbatim:

> This file is a work of a U.S. Army soldier or employee, taken or made as part of
> that person's official duties. As a work of the U.S. federal government, it is
> in the public domain in the United States.

The public-domain status applies to the United States only. The maintainer
accepted this on 2026-11-24 (issue #5).

## How the clip was made

The clip is the first 28.9 seconds of the recording, from 1.0 second to
29.9 seconds. It holds the first three lines of the first verse:

1. "Silent night, holy night"
2. "All is calm, all is bright"
3. "Round yon virgin mother and child"

A fade of 0.4 seconds closes the clip. The command:

```sh
ffmpeg -ss 1.0 -t 28.9 -i "Silent_Night_(choral).ogg" -map_metadata -1 \
  -af 'afade=t=out:st=28.5:d=0.4' -ac 2 -ar 44100 -c:a libvorbis -q:a 3 \
  silent-night.ogg
```

## How the marks were made

No speech model was available on the machine that made the marks. The times come
from three sources:

1. **Phrase times.** An energy envelope of the audio, in frames of 50 ms. Each
   phrase starts and ends at a clear drop of 20 dB or more between lines.
2. **Word times.** Energy dips of 5 to 12 dB inside each phrase. Consonants such as
   `n`, `m`, `s` and `ch` cause these dips. The rhythm of the hymn tune decides
   which dip belongs to which word boundary.
3. **Line check.** The English closed captions on the Commons page give the start
   of each line to 0.5 seconds. The phrase times agree with the captions.

The phonemes use the first entry of the CMU Pronouncing Dictionary for each word.
They use the mapping table and the weights in
`docs/specs/features/03-phoneme-breakdown.md`. Each phoneme boundary is a
multiple of 50 ms.

Expected accuracy:

- Phrase start and end: within 100 ms.
- Word boundaries: within 250 ms. A choir sings legato, so some boundaries have
  no clear dip.
- Phonemes: an even spread by weight, not measured from the audio.

Nobody listened to the clip to check the marks. The marks are a fixture for tests,
not a reference for accuracy.

## Data shape

The file has three keys:

- `song`: `name`, `durationMs` and `frameMs` (50).
- `voices`: one voice with `id`, `name` and `order`.
- `marks`: the fields of `MARK` in the data model of `docs/specs/spec.md`.

A word has a phrase as its parent. A phoneme has a word as its parent. Marks on one
layer do not overlap. The phonemes of a word fill the word with no gap.
