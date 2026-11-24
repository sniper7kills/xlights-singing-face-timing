---
paths:
  - "src/**/*.{ts,tsx}"
  - "infra/**"
  - "scripts/**"
  - ".github/workflows/**"
  - "docs/specs/**/*.md"
---

# External APIs — read the docs, never assume

Before you write a call against any item below, confirm the operation name, the
required parameters, the response shape, the error cases and the permissions from
its documentation. Use the version that `package.json` pins. Cite the URL and the
version in the PR body. If the documentation contradicts the spec, stop and ask.
Do not reconcile by guess.

| Item | Version pinned | Documentation |
|---|---|---|
| `@huggingface/transformers` | 4.3.2 | https://huggingface.co/docs/transformers.js/api/pipelines , https://huggingface.co/docs/transformers.js/en/guides/webgpu , https://huggingface.co/docs/transformers.js/en/guides/dtypes |
| Whisper speech model files | `onnx-community/whisper-{tiny,base,small}_timestamped` | https://huggingface.co/onnx-community |
| wavesurfer.js | 8.1.x | https://wavesurfer.xyz/docs/ |
| CMU Pronouncing Dictionary | file `cmudict.dict` | https://github.com/cmusphinx/cmudict |
| Web Audio `decodeAudioData` | browser | https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData |
| xLights `.xtiming` format | commit `99a289bf` | https://github.com/xLightsSequencer/xLights — `src-core/render/Element.cpp`, `src-ui-wx/sequencer/RowHeading.cpp`, `src-core/render/SequenceFile.cpp`, `src-core/effects/FacesEffect.cpp` |
| xLights manual | current | https://manual.xlights.org/xlights/chapters/chapter-four-sequencer/singing-faces.md |
| AWS CloudFormation (S3, CloudFront, IAM) | current | https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/ |
| AWS CLI | 2.x | `aws s3 sync help`, `aws cloudfront create-invalidation help` |
| GitHub OIDC with AWS | current | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html |

Not confirmed yet. Confirm each one before the code that depends on it:

- The wavesurfer.js method and event names for zoom and scroll.
- The output of the xLights `XmlSafe` function for `&`, `<`, `>`, `"` and `'`.

Confirmed on 2026-11-24 for `cmudict.dict` at commit
`74790861f652b15e4ac49015a90074ad62a27690`, from the file and its `LICENSE`:

- Each line is a word in lower case, one space, then CMU symbols separated by one
  space. Vowel symbols carry a stress digit `0`, `1` or `2`.
- A variant entry has a number after the word, for example `hello(2)`. It always
  comes after the first entry of the word.
- A `#` starts a comment to the end of the line, for example
  `aalborg AO1 L B AO0 R G # place, danish`. 22 lines have a comment.
- The file has 135166 entries for 126052 words, in ASCII. A word holds the letters
  `a` to `z`, `'`, `.` and `-`.
- The licence is a BSD-2-Clause style licence, copyright Carnegie Mellon
  University. It allows redistribution and requires the copyright notice with
  each copy.

Confirmed on 2026-11-24 for `@huggingface/transformers` 4.3.2, from the typed API
in `node_modules/@huggingface/transformers/types/` and the model files on the
Hugging Face Hub. Pull request #71 cites each source.

- Word times: `onnx-community/whisper-{tiny,base,small}_timestamped` each have
  `alignment_heads` in `generation_config.json`. A real run of tiny and base
  returned word times in headless Chromium on `wasm`.
- Download progress: the `pipeline` option `progress_callback`. The event
  `{ status: 'progress_total', loaded, total, progress, files }` gives the bytes of
  all files. The library sends progress events for cached files too.
- Sample rate: 16 000 Hz. Each `preprocessor_config.json` sets `sampling_rate`.
  The pipeline does not resample a `Float32Array`.
- Stop: the typed API has no abort signal. The app terminates the worker.
- The library loads the ONNX runtime WASM file from `cdn.jsdelivr.net` by
  default. The worker sets `env.backends.onnx.wasm.wasmPaths` to a file that the
  app serves.
- The model files redirect from `huggingface.co` to `us.aws.cdn.hf.co`.
- The cache check and the download total read the dtype key `model` for the
  Whisper encoder. The model load reads the key `encoder_model`. The app sets both.

Confirmed on 2026-11-24: the CloudFormation properties in `infra/hosting.yml` and
the IAM action names of the deploy role. Pull request #52 cites each page. The
template passes `cfn-lint`. No stack exists yet, so AWS has not validated it.

Confirmed on 2026-11-24 for wavesurfer.js 8.1.1, from the typed API in
`node_modules/wavesurfer.js/dist/wavesurfer.d.ts`: `loadBlob(blob, channelData?,
duration?)`, `play()`, `pause()`, `isPlaying()`, `setOptions()`, `destroy()`, and the
events `timeupdate` (time in seconds), `play`, `pause` and `finish`. If
`loadBlob` gets `channelData` and `duration`, wavesurfer.js does not decode the
blob. The pull request of issue #12 cites the pages.

Evidence format:

```
Verified against: https://huggingface.co/docs/transformers.js/api/pipelines (4.3.2, retrieved 2026-11-24)
Verified against: `aws s3 sync help` (aws-cli/2.37.9)
```

Anything that creates, deletes or changes an AWS resource is confirmed with the
user first. Read-only `list-*`, `get-*` and `describe-*` calls are the safe way to
learn the shape of a real resource.
