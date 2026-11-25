# 0008 — Separate the vocals in the browser with Spleeter 2-stem

Date: 2026-11-24
Status: accepted

## Context

Issue #117 asks for an option that removes the instruments before a transcribe
run. The separation must run in the browser, on the `wasm` device of
`onnxruntime-web`, and send no audio. The candidates were Demucs (`htdemucs`) in
several ONNX exports and packages, and Spleeter 2-stem in the ONNX export of
sherpa-onnx. The measurements are in the finding comment on issue #117
(https://github.com/sniper7kills/xlights-singing-face-timing/issues/117#issuecomment-7150055123).
The maintainer stopped the measurements on this machine after that comment, so
no other run was made.

Measured with headless Chromium and Firefox 159, 12 logical cores, `wasm` with 2
threads:

| Candidate | Download | Audio seconds for each second of run | Peak RSS of one browser process |
|---|---|---|---|
| Spleeter 2-stem | 78.6 MB | 13.6 to 16.2 (Chromium), 14.5 (Firefox) | 0.87 to 1.18 GB |
| `demucs-web` with `htdemucs_embedded.onnx` | 180.5 MB | 0.70 to 0.77 (Chromium), 0.55 (Firefox) | 4.03 to 4.46 GB |
| `htdemucs_ft_vocals_fp16weights.onnx` | 165.6 MB | 0.61 (Chromium, no graph optimization) | 1.64 GB; `std::bad_alloc` with graph optimization `all` |

One song with vocals was measured for accuracy: "Ain't We Got Fun" (1921, 218.9 s,
public domain), with the base speech model. The full mix gave 151 to 156 of the 254
sheet words, the Spleeter vocals 167 to 171, and the Demucs vocals 175 (Chromium
only). With the full mix, the speech model invented one line 14 times over an
instrumental part. The Spleeter vocals gave no invented line. The word start times
stayed within 0.02 s (median of 20 words) of the full-mix run. One song is a small
sample, and the recording is from 1921, so the accuracy gain for a modern song is
not measured.

The weights of Demucs have no clear licence. The README of
https://github.com/adefossez/demucs states: "The license of the weights is not
clear: MusDB contains some data that were only usable for research purpose."

## Decision

The engine in `src/features/vocal-separation/engine/` runs Spleeter 2-stem:

- Library: `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0, the same version as
  `@huggingface/transformers`, import `onnxruntime-web/wasm`, the `wasm` device
  with the thread count of `threads.ts`.
- Model: `vocals.onnx` and `accompaniment.onnx` of
  `csukuangfj/sherpa-onnx-spleeter-2stems` at commit
  `7001ba316a615cacddb3f9ef3ec416661a277e26`, 78 636 679 bytes together.
- Host: the Hugging Face Hub, which sends CORS headers. The browser keeps the files
  in the Cache API cache `vocal-separation-models-v1`. A file goes into the cache
  only after a complete download with the correct size and the correct SHA-256.
  The hashes are the Git LFS object ids of the Hub. With no usable cache, the run
  keeps the files in memory, and a failed cache write does not stop the run.
- Output check: a vocals sample that is NaN or Infinity stops the run with the
  failure kind 'model'.
- Signal path: an STFT in the app (4096 points, hop 1024, periodic Hann window, no
  centre padding), the magnitude of the first 1024 bins into both models, the
  soft mask v² / (v² + a²), the inverse STFT, and the mean of the two channels.
- Segments: 512 frames, 527 360 samples (about 12 s), with an overlap of 32 768
  samples (about 0.74 s) and a linear cross-fade. The memory of a run grows with
  the song length only by the input and output arrays.

The option stays off by default. The accuracy sample is one old recording, and
the maintainer stopped further measurements.

## Consequences

- The first run with the option on downloads 79 MB. The dialog states the size
  before the first use. Later runs download nothing.
- A 4-minute song takes about 15 to 18 s to separate on the measured machine. A
  slower computer takes longer, and the dialog shows the progress.
- The separate worker has its own chunk (78 kB) and its own WASM file
  (`ort-wasm-simd-threaded.wasm`, 14.3 MB, 3.7 MB gzip). With the option off, the
  app loads neither.
- Spleeter keeps the bins under about 11 kHz only. The speech model reads 16 kHz
  audio, so it loses nothing.
- Licence: the Spleeter repository has the MIT licence, and the weights are its
  release asset with no separate licence. The app does not bundle the files. The
  notice is in `docs/licences/`.
- Demucs separates better on paper, but it is about 20 times slower here and needs
  more than 4 GB in one process. Issue #122 adds it as an experimental second
  model. See the section of 2026-11-24 below.

## 2026-11-24 — Demucs as a second model (issue #122)

The maintainer asked for Demucs as a second choice after the measurements, and then
decided: "Demucs weights licence is acceptable, go ahead with #122". The README of
https://github.com/adefossez/demucs states: "The license of the weights is not
clear: MusDB contains some data that were only usable for research purpose."

**Decision.** The transcribe dialog has the choice "Separation model". Spleeter
stays the default. Demucs is the second choice, with the label "experimental":

- Package: `demucs-web` 1.0.2 (MIT, https://github.com/timcsy/demucs-web), pinned
  to the exact version. It declares `onnxruntime-web` `>=1.17.0` as a peer
  dependency, and a prerelease version does not satisfy that range. An `overrides`
  entry in `package.json` gives it the version of the app.
- Model: `htdemucs_embedded.onnx` of `timcsy/demucs-web-onnx` at commit
  `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d`, 180 534 758 bytes, with the SHA-256
  `lfs.oid` of the Hub API. `loadModelFiles` downloads it, checks the size and the
  hash, and keeps it in the same Cache API cache as Spleeter.
- Runtime: `onnxruntime-web/webgpu`, with the `asyncify` WASM file that the
  transcribe worker also uses. The engine uses `webgpu` when the worker gets a
  WebGPU adapter. After a `webgpu` failure, it runs again on `wasm` with the thread
  count of `threads.ts`. The README of `demucs-web` documents the default
  `executionProviders` `['webgpu', 'wasm']` and the adapter check.
- Chunk: the Demucs engine and `demucs-web` are a separate chunk
  (`demucsSeparator-*.js`, 125 kB, 41 kB gzip) that the separate worker imports
  only for a Demucs run. The workers now build with `worker.format` `'es'`, because
  the default `'iife'` puts a dynamic import into the worker file. The measurement
  build of issue #117 used `'es'` for both workers.
- Failures: a Demucs memory failure gives the Spleeter message and the extra action
  "Use the fast model". A sample that is not finite is a failure of kind `model`.

**Measured numbers.** These come from the runs of issue #117, not from issue #122:
https://github.com/sniper7kills/xlights-singing-face-timing/issues/117#issuecomment-7150055123 .
Headless Chromium and Firefox 159, 12 logical cores, `wasm` with 2 threads,
`demucs-web` 1.0.2 with the same model file:

| Browser | Song | Audio | Run | Audio s / s | Peak RSS (tree / one process) |
|---|---|---|---|---|---|
| Chromium | Good King Wenceslas | 245.5 s | 351.2 s | 0.70 | 5.07 GB / 4.28 GB |
| Chromium | Ain't We Got Fun | 218.9 s | 282.6 s | 0.77 | 5.21 GB / 4.46 GB |
| Firefox | Ain't We Got Fun, first 60 s | 60 s | 109.2 s | 0.55 | 4.76 GB / 4.03 GB |

The Demucs vocals gave 175 of the 254 sheet words, and the Spleeter vocals 171
(Chromium). No browser with a WebGPU adapter was available, so the `webgpu` device
has no measurement.

**Not run.** The maintainer stopped all model runs on the development computer.
Nobody ran the Demucs engine in the built app before the merge. The engine follows
the calls of the #117 measurement page: `new DemucsProcessor({ ort, sessionOptions,
onProgress })`, `loadModel(arrayBuffer)` and `separate(left, right)`. Unit tests
replace the package with a fake.

**Consequences.**

- A Demucs run downloads 181 MB one time, and takes about 5 to 6 minutes for a
  4-minute song on `wasm`. On `wasm`, its peak memory is at the 4 GB limit of
  WASM, so the dialog warns before the run when the browser has no WebGPU adapter.
- With the fast model selected, the browser loads no Demucs file.
- The notices of Demucs and `demucs-web` are in `docs/licences/`.
