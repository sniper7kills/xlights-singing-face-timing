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
- It clusters the embeddings with the `centroid` method of pyannote.audio: threshold
  0.7045654963945799, a small group size of 12, and 12 groups at most. These values
  are those of the pyannote.audio 3.1 pipeline for speech.
- A frame belongs to a singer when at least half of the windows over it give it to
  that singer. Ranges shorter than 300 ms are dropped.

The option "Put each singer on its own voice" stays off by default.

## Consequences

- The first use downloads 32 522 457 bytes of model files from the Hugging Face Hub.
  The library cache keeps them, so the next run downloads nothing.
- No audio leaves the browser. No second ONNX runtime is needed.
- The accuracy on singing is NOT measured. Both models are made for speech. The
  result can split one singer into more voices, or join two singers into one. The
  one data point on a mix split 2 expected voices into 8.
- Singers who sing together give overlapping ranges, not two clean signals. A group
  that sings in unison can count as one singer or as more singers.
- The clustering values come from speech. A tuned threshold for singing needs
  labelled test songs and a measurement on another machine.
- The WeSpeaker model has the CC BY 4.0 licence, which requires attribution. The
  notice is in `docs/licences/singer-models.md`.
- The test on the maintainer's song stays open as a check for the maintainer on
  another machine.
