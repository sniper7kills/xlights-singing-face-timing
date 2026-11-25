# 0009 — Find the singers with speaker diarization in the browser

Date: 2026-11-24
Status: accepted

## Context

The maintainer asked that a transcribe run puts each singer on a voice of its own
(issue #119). The vocal separation of #117 gives one vocals stem for all singers.
So a second step must tell the singers apart. Three ways were checked against their
documents on 2026-11-24:

| Way | Files | Licence | Gated download | Browser path | Result |
|---|---|---|---|---|---|
| pyannote segmentation 3.0 (`onnx-community/pyannote-segmentation-3.0`) plus the WeSpeaker ResNet34 embedding (`onnx-community/wespeaker-voxceleb-resnet34-LM`) | 5 986 908 + 26 535 549 bytes at fp32 | MIT; CC BY 4.0 | No | Yes, in `@huggingface/transformers` 4.3.2 | Kept |
| The same segmentation plus `Xenova/wavlm-base-plus-sv` | 402 471 430 bytes at fp32 | Not stated | No | Yes | Dropped: no licence, 15 times the size |
| A lead and backing vocal model, for example `UVR_MDXNET_KARA_2.onnx` | about 50 MB | No licence found for the weights | n/a | Not documented | Dropped |

The segmentation model reads 10 s windows. It finds up to 3 speakers in a window,
and up to 2 at the same time. Its card states that it "cannot be used to perform
speaker diarization of full recordings on its own". The speaker numbers of one
window do not match the numbers of the next window, so the embedding model and a
clustering must join them.

The maintainer stopped the measurements on the development machine before the
accuracy tests. The measured numbers are these:

| Measurement | Where | Result |
|---|---|---|
| Segmentation of one 10 s window | Node, `onnxruntime-node`, fp32 | 82 ms |
| Embedding of 3 s of audio | Node, `onnxruntime-node`, fp32 | 173 ms |
| Download, load and search for the first 30 s of the mix of the maintainer's test song, with no vocal separation | headless Chromium, `wasm` | 14 s from the browser start to the result; 8 singers in 21 ranges |

The test song has one male solo voice and, as far as the maintainer knows, a female
chorus. The expected result is 2 voices. The one data point gave 8 singers. It is
the mix with the orchestra, not the vocals stem, so it is no accuracy score. No
accuracy on singing is measured.

## Decision

The app finds the singers with pyannote segmentation 3.0 and the WeSpeaker ResNet34
embedding, both at fp32, through `@huggingface/transformers`. The engine is in
`src/features/singer-voices/engine/`:

- It reads the vocals in 10 s windows, with a step of 5 s.
- It takes one embedding for each local speaker of a window, from the frames in
  which that speaker sings alone.
- It clusters the embeddings with the `centroid` method of pyannote.audio (changed
  by issue #137, see below): threshold
  0.7045654963945799, a small group size of 12, and 12 groups at most. These values
  are those of the pyannote.audio 3.1 pipeline for speech.
- A frame belongs to a singer when at least half of the windows over it give it to
  that singer.
- A singer with less sung time than 5% of all sung time, or less than 3 s, joins
  the singer with the closest centroid (`MIN_SINGER_SHARE` and `MIN_SINGER_MS`).
  This guard limits the singers that a split of one voice can add. The two values
  are NOT tuned on songs, and the guard does not replace a measurement.
- Ranges shorter than 300 ms are dropped.

The option "Put each singer on its own voice (experimental)" stays off by default.
Its note tells the person that the app can find too many singers.

The engine was changed after its one run and was not run again. The changes are
the load of the segmentation processor, so that the cache check finds all files,
and the guard for short singers.

## Consequences

- The first use downloads 32 522 457 bytes of model files from the Hugging Face Hub.
  The library cache keeps them, so the next run downloads nothing.
- No audio leaves the browser. No second ONNX runtime is needed.
- The accuracy on singing is measured on one song and two controls only. See "What
  a real song showed" below. Both models are made for speech. The
  result can split one singer into more voices, or join two singers into one. The
  one data point on a mix split 2 expected voices into 8.
- Singers who sing together give overlapping ranges, not two clean signals. A group
  that sings in unison can count as one singer or as more singers.
- The clustering values come from speech. A tuned threshold for singing needs
  labelled test songs and a measurement on another machine.
- The WeSpeaker model has the CC BY 4.0 licence, which requires attribution. The
  notice is in `docs/licences/singer-models.md`, and the "How it works" strip
  credits both models.
- The test on the maintainer's song stays open as a check for the maintainer on
  another machine.

## What a real song showed (2026-11-24, issue #137)

The maintainer ran "Baby, It's Cold Outside" (Dean Martin, 1959; 143.75 s) on
production with both options on. All phrases stayed on one voice. The maintainer
then allowed model runs on the development computer, and the run was repeated
there.

### Method

- The engine modules of `main` ran in Node with the same models and settings:
  Spleeter vocals, 16 kHz mono, then `diarize`. A log recorded each stage.
- A pitch track of the vocals labelled each local speaker. The man sings at a
  median of 129 to 222 Hz. The chorus of women sings at 246 to 320 Hz.
- Two controls were made from free solo recordings, cut into turns of 5 to 10 s:
  - Control 1: "Twinkle Twinkle Little Star - sung with full lyrics.ogg" (man, CC0)
    and "A Chantar2.ogg" (woman, public domain), both from Wikimedia Commons. One
    version has clean turns. One version has 1.5 s of overlap at each turn.
  - Control 2: the same man and "Singin' in the Rain.mp3" (a second man,
    CC BY 4.0, Wikimedia Commons).
  - Two solo recordings, "Twinkle…" and "Napoliebelloestinco.ogg" (public domain),
    must give one singer.

### Numbers of the song

| Stage | Result |
|---|---|
| Windows | 28; 25 with 2 local speakers, 2 with 3, 1 with 1 |
| Embeddings | 52, all finite; 27 of the man, 25 of the chorus |
| Embedding length | man 1.3 to 8.9 s; chorus 1.0 to 3.1 s |
| Distance, all pairs | min 0.435, quartiles 1.121, 1.306, 1.359, max 1.515 |
| Distance, same part | median 1.124 |
| Distance, man to chorus | median 1.347 |
| Centroid of the man to centroid of the chorus | 0.764 |
| Mean distance to the own centroid | man 0.663; chorus 0.867 |
| Groups after the threshold 0.7046 | 29: the man in one group of 19 (119.6 s), all other groups 1 or 2 embeddings |
| Small group size | min(12, round(52 / 10)) = 5 |
| Groups after the join of small groups | 1 |
| Rule for short singers | no effect: one group was left |

### Cause

The segmentation model separates the man from the chorus in almost every window.
The models get the right audio: mono, 16 kHz, the frames of one local speaker, and
the Kaldi filter bank of the WeSpeaker card. The two parts are apart as groups:
their centroids are 0.764 apart, more than the threshold. But each chorus part is
short, so each chorus embedding is far from the others. No two chorus embeddings
merge under the speech threshold. The man is the only group with 5 embeddings or
more. The pyannote.audio rule then joins each small group into the only large
group, so all 52 embeddings become one singer. pyannote.audio does the same with
this input: the engine followed it correctly.

A change of the threshold does not fix it. With the old pipeline, the song gave two
singers at 0.90 only, and one singer at 0.85 and at 0.95.

### Decision

- `groupSingers` in `src/features/singer-voices/engine/clustering.ts` replaces
  `clusterEmbeddings`. It merges the centroids down to one group and records the
  count of large groups after each join.
- With a count from the person, it cuts the merges where the count of large groups
  is closest to that count, as pyannote.audio does with `num_speakers`. The small
  groups join the closest large group. The threshold and the rule for short singers
  do not apply.
- With "Automatic", it takes the highest count for which each singer holds 5% of
  the embedding time (`MIN_SINGER_SHARE`), and each pair of centroids is more than
  0.7045654963945799 apart. The threshold keeps its speech value. It applies to the
  large groups, not to single embeddings.
- The dialog has the choice "Singers": "Automatic", "2", "3", "4".

### Results

Node, real models, the old engine against the new engine:

| Input | Expected | Old | New, "Automatic" | New, "2" |
|---|---|---|---|---|
| The song | 2 | 1 | 2 | 2 |
| Control 1, turns | 2 | 2 | 2 | 2 |
| Control 1, overlap | 2 | 1 | 2 | 2 |
| Control 2, two men | 2 | 1 | 1 | 2, but most time on one singer |
| Solo "Twinkle…" | 1 | 1 | 1 | 2 (the count forces it) |
| Solo "Napoli…" | 1 | 1 | 1 | 2 (the count forces it) |

The built app in headless Chromium (`wasm`, Spleeter, Whisper base), with the new
engine:

| Input | "Singers" | Voices | Phrases | Phrases on each voice | Run time | Peak memory of the browser |
|---|---|---|---|---|---|---|
| The song | Automatic | 2 | 37 | chorus 16, man 34 (13 on both) | 309 s, downloads included | 1682 MB |
| The song | 2 | 2 | 37 | the same as "Automatic" | 87 s | 2116 MB |
| Control 1, turns | Automatic | 2 | 35 | 19 and 30 | 188 s | 1783 MB |
| Control 1, turns | 2 | 2 | 35 | the same as "Automatic" | 104 s | 2200 MB |
| Control 1, overlap | Automatic | 2 | 15 | 15 and 5 | 72 s | 1700 MB |
| Control 1, overlap | 2 | 2 | 15 | the same as "Automatic" | 60 s | 1917 MB |

A hand check of 20 phrases of the song, spread over the song: 10 are on the correct
voice only. 6 are on the correct voice and have a copy on the other voice. 1 line of
the man and the chorus is on the voice of the man only. 3 could not be judged: two
lines that both parts can sing, and one line that Whisper made up. The speech model
wrote few lines of the chorus: most chorus lines have no phrase.

On control 1 with turns, 26 of 35 phrases are on the correct voice only, 7 have an
extra copy, 1 misses a singer and 1 is on the wrong voice.

### Limits that remain

- Two voices of the same kind are not kept apart. The centroids of the two men of
  control 2 are 0.486 apart, less than the threshold. A count of 2 gives two
  singers, but each one holds a mix of both men.
- A phrase in which the chorus answers the man inside the phrase gets both singers,
  so a copy goes to both voices. The rule of `SINGER_SHARE` (30%) decides it. See
  the phrase table of issue #137.
- A wrong count gives wrong singers. A count of 3 on the song splits the chorus and
  puts most of it on the man.
- One song and two controls are the whole measurement.
