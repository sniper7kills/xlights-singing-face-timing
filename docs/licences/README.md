# Licences of third-party files

The app does not bundle the model files. The browser downloads them at run time
from the host below. The app bundles the `demucs-web` code. Each file keeps the
licence of its source.

## Whisper speech models

- Use: the transcribe step in the browser. See
  `docs/adr/0002-speech-model-in-browser.md`.
- Files: the ONNX files of `onnx-community/whisper-tiny_timestamped`,
  `onnx-community/whisper-base_timestamped` and
  `onnx-community/whisper-small_timestamped` on the Hugging Face Hub. The model
  cards state no licence. Each card names its base model, for example
  `openai/whisper-base`.
- Source of the weights: Whisper by OpenAI, https://github.com/openai/whisper .
  The README, section "License", states: "Whisper's code and model weights are
  released under the MIT License."
- The model cards of `openai/whisper-tiny`, `openai/whisper-base` and
  `openai/whisper-small` on the Hugging Face Hub state the licence `apache-2.0`.
  The app credits the licence of the source repository.
- Checked on 2026-11-25 through the Hub API
  (`https://huggingface.co/api/models/<repo>`) and the README of the repository.

## Spleeter 2-stem model

- Use: the vocal separation step of a transcribe run. See
  `docs/adr/0008-vocal-separation-in-the-browser.md`.
- Files: `vocals.onnx` (39 318 336 bytes) and `accompaniment.onnx` (39 318 343
  bytes) from https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems ,
  commit `7001ba316a615cacddb3f9ef3ec416661a277e26`.
- Source of the weights: the `2stems.tar.gz` release asset of Spleeter by Deezer,
  https://github.com/deezer/spleeter/releases/tag/v1.4.0 . The repository has the
  MIT licence. The copy is in `spleeter-LICENSE.txt`.
- The ONNX export: `scripts/spleeter/export_onnx.py` of
  https://github.com/k2-fsa/sherpa-onnx (Apache-2.0), commit
  `716ba8317bb36cbcce9ac6c130396e8ec71b3c9c`.
- The Hugging Face repository states no licence. The Spleeter repository states the
  MIT licence for its code, and it gives no separate licence for the weights.

## Demucs `htdemucs` model

- Use: the vocal separation step of a transcribe run with "Separation model" set
  to Demucs. See `docs/adr/0008-vocal-separation-in-the-browser.md`.
- File: `htdemucs_embedded.onnx` (180 534 758 bytes, SHA-256
  `e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077`) from
  https://huggingface.co/timcsy/demucs-web-onnx , commit
  `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d`. The app does not bundle the file.
- Source of the weights: Demucs by Meta, https://github.com/adefossez/demucs . The
  code has the MIT licence. The copy is in `demucs-LICENSE.txt` (commit
  `829d21890023800713e5dd231c67e43ecc06069b`).
- The README of Demucs, section "License", states: "The license of the weights is
  not clear: MusDB contains some data that were only usable for research purpose."
- The Hugging Face repository states no licence.
- The maintainer accepted this state on 2026-11-24: "Demucs weights licence is
  acceptable, go ahead with #122".

## `demucs-web` 1.0.2

- Use: the JavaScript that prepares the Demucs input and joins the output. The
  app bundles it in the chunk of the Demucs engine.
- Source: the npm package `demucs-web`, https://github.com/timcsy/demucs-web .
- Licence: MIT. The copy is in `demucs-web-LICENSE.txt`.
