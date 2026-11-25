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
  only after a complete download with the correct size.
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
  more than 4 GB in one process. A later issue can add it on the `webgpu` device or
  on a server, if its weights get a clear licence.
