# 0011 — Split the singers into two audio tracks in the browser with WebGPU

Date: 2026-11-25
Status: accepted

## Context

The singer step of issue #119 gives each phrase of a run to a singer. It reads one
vocals track, so it cannot give two voices where two people sing at the same time.
Issue #191 measured a song with two singers: a run on two separate tracks found
185 words, and a run on the mixed vocals found 154 words.

Epic #192 asks for a run that divides the vocals into two audio tracks, one for
each singer, and puts each track on its own voice. The maintainer decided on
2026-11-25:

- The step runs in the browser with WebGPU.
- The person selects the mode "Male and female" or "Lead and backing".
- The result is two voices.
- The site bucket holds the model files. A local companion program can come later.

## Decision

The transcribe dialog has the option "Split the singers (experimental)", off by
default. Issue #193 builds the option, the run step and a fixture engine. Issue
#194 builds the real engine.

- **Order of the steps.** The run separates the vocals first, then splits the
  vocals into two singer tracks, then transcribes each singer track with the source
  of the run. A remote run sends one request for each singer track.
- **Two tracks, two modes.** The engine returns two tracks with a label each:
  `female` and `male`, or `lead` and `backing`. The app puts the tracks in the label
  order of the mode and names the voices "Female" and "Male", or "Lead" and
  "Backing".
- **One interface.** The engine is behind the type `Splitter` in
  `src/features/singer-split/splitter.ts`: the vocals in, the mode in, a progress
  callback, an abort signal, and two tracks out. The interface holds no ONNX
  detail, so the real engine can change its model with no change to the app side.
- **Audio format.** The models of this kind read stereo audio at 44 100 Hz. The
  vocal separation keeps its vocals at 44 100 Hz in memory during the run, as one
  channel. The run gives these vocals to the split engine as two equal channels.
  The vocals at 22 050 Hz are only the stored copy, so the engine never reads them.
- **WebGPU.** The option is disabled in a browser where `navigator.gpu` gives no
  adapter. The check is one function, `canSplitSingers`, so a test can replace it.
- **Model files.** The engine reads its model files from the app origin, at
  `models/<file>` in the site bucket. It checks the size and the SHA-256 of each
  file, and keeps the files in the Cache API, as the vocal separation engine does
  (ADR 0008). A file of several gigabytes needs a new decision.
- **Lyrics.** The app cannot tell which lyrics line belongs to which singer, so a
  run with the singer split uses the words of the speech model and reads no lyrics.
- **Undo.** The marks, the two new voices and the replace of the voices of the last
  run are one undo step, as for the singer step (issue #174).
- **Fixture engine.** When `__SPLIT_FIXTURE__` is true, the client starts a worker
  that downloads no model. The first track keeps the first 60% of the vocals, the
  second track keeps the last 60%, and the rest of each track is 0. The transcribe
  fixture gives no word where the audio is 0, so the two voices get different words
  with a part in common.

## Alternatives

- **Split on a server or in a companion program.** The audio would leave the
  computer, or the person would install a program. The maintainer keeps this for
  later.
- **Model files from the Hugging Face Hub.** The vocal separation reads its files
  from the Hub. The site bucket gives one origin, no dependency on a third party,
  and a fixed copy of each file. The bucket costs storage and transfer.
- **Use the lyrics of the person.** Each lyrics line would need a singer. The app
  has no rule for it, so the run leaves the lyrics out.
- **More than two singers.** The models of this kind give two tracks. More singers
  are out of scope.

## Consequences

- A browser with no WebGPU cannot use the option. The dialog states the reason.
- A run with the singer split runs the speech model two times, so it takes about
  two times as long as a run with no split.
- The deploy must put the model files in the bucket at `models/`. Issue #194
  names the files, the sizes and the SHA-256 values. The first export had Concat
  and Split nodes with 62 tensors and failed on a WebGPU device with 16 storage
  buffers for each shader. Version 2 of the files (`.v2.w16.onnx`) has 5 tensors at
  most for each node.
- Licences, ruling of the maintainer on 2026-11-25: the app ships both model files
  with attribution. The authors state no licence.
  - "BS-RoFormer male and female vocals model" by aufr33. Source: the model list
    of python-audio-separator 0.48.0, file
    `bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt`. A mirror at
    huggingface.co/Politrees/UVR_resources has the tag `mit`. The author states no
    licence.
  - "Mel-Band RoFormer karaoke model" by becruily. Source:
    https://huggingface.co/becruily/mel-band-roformer-karaoke , file
    `mel_band_roformer_karaoke_becruily.ckpt`. The page states no licence.
  - This project converted each model from PyTorch to ONNX with float16 weights.
    The STFT is outside the model. The project did not train the model.
  - The model code is the RoFormer implementation of
    ZFTurbo/Music-Source-Separation-Training (MIT), as packaged in
    python-audio-separator 0.48.0. The licence file of that package is the MIT
    License, "Copyright (c) 2023 karaokenerds".
  - The "How it works" card of the app and `public/models/NOTICE.txt` give the
    attribution. The notice deploys with the site to `models/NOTICE.txt`.
