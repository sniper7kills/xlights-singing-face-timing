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
| Web Audio `OfflineAudioContext` | browser | https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext/OfflineAudioContext , https://webaudio.github.io/web-audio-api/ |
| Autoplay policy | browser | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay |
| xLights `.xtiming` format and Faces effect | tag `2026.21`, commit `a123de002e04b9fe9a8e56a7da92ebbf831615ba` | https://github.com/xLightsSequencer/xLights — `src-core/render/Element.cpp`, `src-ui-wx/sequencer/RowHeading.cpp`, `src-core/render/SequenceFile.cpp`, `src-core/utils/UtilFunctions.cpp`, `src-core/effects/FacesEffect.cpp`, `src-ui-wx/effectpanels/FacesPanel.cpp`, `documentation/xlDo Commands.txt` |
| ZIP file format (PKWARE APPNOTE) | 6.3.10 | https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT — sections 4.3.7, 4.3.12, 4.3.16, 4.4.1.4, 4.4.2 to 4.4.7, 4.4.15 |
| xLights manual | current | https://manual.xlights.org/xlights/chapters/chapter-four-sequencer/singing-faces.md |
| AWS CloudFormation (S3, CloudFront, IAM) | current | https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/ |
| AWS CLI | 2.x | `aws s3 sync help`, `aws cloudfront create-invalidation help`, `aws cloudfront wait invalidation-completed help` |
| IAM actions for CloudFront | current | https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazoncloudfront.html |
| GitHub OIDC with AWS | current | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html |
| ONNX Runtime Web (`onnxruntime-web`) | 1.31.0-dev.20260914-8d85527a0, a direct dependency with the same version as `@huggingface/transformers` | https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html , `node_modules/onnxruntime-web/types.d.ts` |
| Spleeter 2-stem model, ONNX export of sherpa-onnx | `csukuangfj/sherpa-onnx-spleeter-2stems` commit `7001ba316a615cacddb3f9ef3ec416661a277e26` | https://github.com/k2-fsa/sherpa-onnx — `scripts/spleeter/export_onnx.py`, `sherpa-onnx/csrc/offline-source-separation-spleeter-impl.h` ; https://github.com/deezer/spleeter |
| Cache API | browser | https://developer.mozilla.org/en-US/docs/Web/API/Cache |
| `demucs-web` | 1.0.2 (exact) | https://github.com/timcsy/demucs-web — `README.md` and `src/processor.js` of the npm package; no type file ships |
| Demucs `htdemucs` model, ONNX export of `demucs-web` | `timcsy/demucs-web-onnx` commit `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d` | https://huggingface.co/timcsy/demucs-web-onnx ; https://github.com/adefossez/demucs |
| ONNX Runtime Web, WebGPU | 1.31.0-dev.20260914-8d85527a0 | https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html , `node_modules/onnxruntime-web/lib/wasm/wasm-utils-import.ts` |
| Cross-origin isolation headers | browser | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy , https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy |
| OpenAI transcription API | current | https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create , https://developers.openai.com/api/docs/guides/speech-to-text |
| speaches (faster-whisper-server) | `master` branch | https://speaches.ai/configuration/ , https://speaches.ai/usage/speech-to-text/ , source `src/speaches/routers/stt.py`, `src/speaches/executors/whisper.py`, `src/speaches/main.py` |
| Mixed content, CORS errors, `XMLHttpRequest.upload`, `fetch`, CSP `connect-src` | browser | https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content , https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors , https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload , https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch , https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src |
| Chrome Local Network Access | Chrome 142 | https://developer.chrome.com/blog/local-network-access |

Confirmed on 2026-11-24 for xLights 2026.21 (issue #138). The rule table with
each source line is in the "Interfaces" section of
`docs/specs/features/06-xtiming-export.md`. The tag commit changes only the version
files after `99a289bf`, so the earlier facts still hold.

- From the source: `XmlSafe` writes `&amp;`, `&lt;`, `&gt;`, `&apos;`, `&quot;`
  and `&#9;`, `&#10;`, `&#13;`, the same as `escapeXml`. The import removes `= <
  > & " '` and each character that is not ASCII from a timing track name, and adds
  `_1`, `_2` to a name that exists. The "Timing Track" list of the Faces effect
  shows only timing tracks with 3 layers. On a model group, the Faces effect draws
  only a "Matrix" face definition.
- From the source: no xlDo automation command imports a timing track. The
  command-line options include `-s` (show folder), `-a` (xFade port A, 49913),
  `-q`, and `--headless` (render to `.fseq` and exit).
- From a real import of the AppImage on Linux: one file with all timing tracks and
  one file for each timing track import with no message. "Export Timing Track"
  writes the same bytes as the app, except `SourceVersion="2026.21"`. Labels with
  `& < > " '` and `café` survive. A Faces effect on each of three "Node Ranges"
  face models follows its timing track in every frame of the render. The steps are
  in `.claude/skills/xlights-import-check/SKILL.md`.
- Not confirmed: a "Single Nodes" or "Matrix" face definition in a real render, a
  vendor `.xmodel`, and xLights on Windows or macOS.

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

Confirmed on 2026-11-24 for `@huggingface/transformers` 4.3.2, from
https://huggingface.co/docs/transformers.js/api/generation/streamers and the
source in `node_modules/@huggingface/transformers/src/` (issue #91):

- A streamer goes to the pipeline call as the generate option `streamer`. The
  typed pipeline options accept a `TextStreamer` only, not a `BaseStreamer`.
- `generate` calls `streamer.put(value)` with the prompt tokens first, then with
  each new token as `[[id]]`. It calls `streamer.end()` at the end of each
  generate pass.
- With `return_timestamps: 'word'`, the pipeline also sets `return_timestamps:
  true`, so Whisper writes timestamp tokens. Whisper then reads each 30-second
  chunk with a seek loop (`_generate_with_seek`), and one chunk can take more than
  one pass. The next pass starts at the first token of the last pair of adjacent
  timestamp tokens.
- A timestamp token id minus `tokenizer.timestamp_begin`, times 0.02 s, is a time
  inside the 30-second window of the pass, not inside the run.
- `WhisperTextStreamer` gives `on_chunk_start(time)` and `on_chunk_end(time)` for
  timestamp tokens, `token_callback_function(tokens)` for each token, and
  `on_finalize()` for each `end()`. Its start and end switch does not reset
  between passes. `TextStreamer.put` decodes all text of the pass after each
  token, and the default `callback_function` writes to the console.
- A token callback gives a time only for a timestamp token. A text token gives no
  time.

Confirmed on 2026-11-24 for the browser Web Audio API (issue #91):

- `new OfflineAudioContext(numberOfChannels, length, sampleRate)`. The channels
  are 1 to 32, the length is more than 0 frames, the sample rate is 3000 to
  768 000 Hz. A value out of range throws `NotSupportedError`.
- `decodeAudioData` is a method of `BaseAudioContext`, so an
  `OfflineAudioContext` has it. The decode resamples the audio to the sample rate
  of the context. The result keeps the channels of the file.
- `OfflineAudioContext` has no `close()` method.
- The autoplay policy applies to an `AudioContext`. A browser can keep an
  `AudioContext` from starting until the page has sticky activation. Firefox
  controls this with `media.autoplay.block-webaudio`. The specification defines
  "allowed to start" for `AudioContext` only.

Confirmed on 2026-11-24 for cross-origin isolation and the `wasm` threads (issue #93):

- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
  require-corp` make a page cross-origin isolated. Source:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
  (last modified 2026-09-04) and
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
  (last modified 2026-07-12).
- Under `require-corp`, a request in `cors` mode passes when the server sends a
  valid `Access-Control-Allow-Origin`. It needs no `Cross-Origin-Resource-Policy`.
- Browser support, from
  https://raw.githubusercontent.com/mdn/browser-compat-data/main/http/headers/Cross-Origin-Embedder-Policy.json:
  the header in Chrome 83, Firefox 79 and Safari 15.2. The value `credentialless`
  in Chrome 96 and Firefox 119. Safari and Safari on iOS do not support
  `credentialless`, so the app uses `require-corp`.
- `SharedArrayBuffer` exists only in a secure context that is cross-origin
  isolated. Source:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements.
  A dedicated worker of an isolated page was isolated in the measured runs of
  Chromium and Firefox (`crossOriginIsolated` true in the worker).
- ONNX Runtime Web: `env.wasm.numThreads` defaults to `0`. With `0`, the runtime
  uses 1 thread when the page is not cross-origin isolated, else
  `min(4, ceil(hardwareConcurrency / 2))`. Source:
  https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html and
  `node_modules/onnxruntime-web/lib/backend-wasm.ts` (1.31.0-dev.20260914). A value
  above 1 with no `SharedArrayBuffer` falls back to 1 thread with a console warning
  (`lib/wasm/wasm-factory.ts`).
- `@huggingface/transformers` 4.3.2 exposes the runtime settings as
  `env.backends.onnx.wasm` (type `Partial<Env>` of `onnxruntime-common`). The
  worker must set `numThreads` before the first `pipeline` call. Source:
  https://huggingface.co/docs/transformers.js/api/env and `src/backends/onnx.js`.
- The runtime JavaScript is in the worker chunk. The worker sets
  `wasmPaths.wasm` only, so the runtime fetches the `.wasm` file from the app
  origin. The thread workers of the runtime load the same worker chunk.
- The Hugging Face hosts send CORS headers. A `GET` with an `Origin` header on
  2026-11-24:
  - `https://huggingface.co/<repo>/resolve/main/config.json` answers `307` with
    `access-control-allow-origin: <origin>` and `vary: Origin`.
  - `https://huggingface.co/<repo>/resolve/main/onnx/encoder_model.onnx` answers
    `302` to `https://us.aws.cdn.hf.co/...` with the same CORS header.
  - `us.aws.cdn.hf.co` answers `206` with `access-control-allow-origin: *`.
  - No host sends `Cross-Origin-Resource-Policy`. The library fetches in `cors`
    mode, so `require-corp` lets the downloads through.
- CloudFront: a response headers policy adds a header that is not a security
  header through `CustomHeadersConfig.Items`, each with `Header`, `Value` and
  `Override`. Source:
  https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-responseheaderspolicy-customheader.html
  and
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html.
  The guide lists no restriction on the two header names. AWS has not validated
  the change, because no stack exists yet.
- Firefox refuses port 4190 (`deniedPortAccess`). Serve a local build on another
  port for a Firefox test.

Confirmed on 2026-11-24: the CloudFormation properties in `infra/hosting.yml` and
the IAM action names of the deploy role. Pull request #52 cites each page. The
template passes `cfn-lint`. No stack exists yet, so AWS has not validated it.

Confirmed on 2026-11-24 for wavesurfer.js 8.1.1, from the typed API in
`node_modules/wavesurfer.js/dist/wavesurfer.d.ts`: `loadBlob(blob, channelData?,
duration?)`, `play()`, `pause()`, `isPlaying()`, `setOptions()`, `destroy()`, and the
events `timeupdate` (time in seconds), `play`, `pause` and `finish`. If
`loadBlob` gets `channelData` and `duration`, wavesurfer.js does not decode the
blob. The pull request of issue #12 cites the pages.

Confirmed on 2026-11-24 for wavesurfer.js 8.1.1, from the typed API in
`node_modules/wavesurfer.js/dist/wavesurfer.d.ts` and the code in
`dist/wavesurfer.js` and `dist/renderer.js`. The pages
https://wavesurfer.xyz/docs/methods , https://wavesurfer.xyz/docs/options and
https://wavesurfer.xyz/docs/events show their text only after a script runs, so
the typed API is the source.

- Zoom: `zoom(minPxPerSec)` throws `No audio loaded` before a load. The option
  `minPxPerSec` through `setOptions()` sets the same zoom and draws again.
- Width: the waveform is `Math.ceil(duration * minPxPerSec)` pixels wide. With
  `fillParent: true`, a waveform narrower than the container stretches to the
  container width. The app sets `fillParent: false` for a set zoom.
- Scroll: `setScroll(pixels)` and `getScroll()` set and read `scrollLeft` of the
  scroll container. `setScrollTime(seconds)` also exists. The browser clamps
  `scrollLeft` to the waveform width.
- Events: `scroll` gives `(visibleStartTime, visibleEndTime, scrollLeft,
  scrollRight)`. `zoom` gives `minPxPerSec`. `timeupdate` fires on each animation
  frame during play.
- A redraw keeps the cursor position in view, so it can change `scrollLeft`. The
  app sets its scroll offset again on each `scroll` event.
- Options: `interact: false` stops clicks and drags. `autoScroll: false` stops the
  scroll during play. `cursorWidth: 0` hides the cursor. `hideScrollbar: true`
  hides the scroll bar.
- Seek: `setTime(seconds)`.

Confirmed on 2026-11-24 for wavesurfer.js 8.1.1, from the typed API in
`node_modules/wavesurfer.js/dist/wavesurfer.d.ts` and the code in
`dist/wavesurfer.js` and `dist/player.js` (issue #33):

- Play speed: `setPlaybackRate(rate, preservePitch?)`. It sets `playbackRate` of
  the media element. If `preservePitch` is given, it also sets `preservesPitch`.
  The comment in the code states that most browsers keep the pitch by default.
- `play(start?, end?)` pauses at `end` and does not repeat, so the app makes the
  loop itself: at each `timeupdate` past the end, it calls `setTime(start)`.
- `setTime(seconds)` does not pause play. It emits `timeupdate` with the new time.
- At the end of the audio, the media element sends `pause` and then `ended`
  (https://html.spec.whatwg.org/multipage/media.html#reaches-the-end). wavesurfer.js
  emits `pause` on the media `pause` event and `finish` on the media `ended` event.

Confirmed on 2026-11-24 for the track rows (issue #130), from MDN and the typed API
and code of wavesurfer.js 8.1.1. The design is in
`docs/adr/0010-track-rows-follow-the-song-audio.md`.

- `HTMLMediaElement.preservesPitch` is `true` by default. It keeps the pitch at a
  different `playbackRate`. Baseline since December 2023. Source:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch
  and https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate .
- `AudioBufferSourceNode.playbackRate` resamples the audio, so the pitch changes
  with the speed. The page names no setting that keeps the pitch. Source:
  https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate .
- `timeupdate` comes "between about 4Hz and 66Hz". Source:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event .
- `seeking` comes when a seek starts. Source:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeking_event .
- `play()` rejects with `NotAllowedError` when the autoplay policy blocks it. A
  muted element, and a page after an action of the person, may play. Source: the
  Autoplay guide in the table above.
- wavesurfer.js plays in a media element unless `backend` is `'WebAudio'`.
  `getMediaElement(): HTMLMediaElement | null` returns it, and null for the Web
  Audio backend. `setTime` sets `currentTime` of the element.
  `setPlaybackRate(rate, preservePitch)` sets `preservesPitch`, then
  `playbackRate`. `destroy()` removes its own element from the page.
- The Content-Security-Policy in `infra/hosting.yml` has `media-src 'self' blob:`,
  so a Blob URL of a WAV file plays.

Confirmed on 2026-11-24 for the OpenAI transcription API, from the API reference
and the speech-to-text guide above (issue #101):

- `POST /audio/transcriptions`, `multipart/form-data`. `file` and `model` are
  required. `language` (ISO-639-1, for example `en`), `prompt`, `response_format`
  and `timestamp_granularities[]` are optional.
- `response_format` is `json` (default), `text`, `srt`, `verbose_json`, `vtt` or
  `diarized_json`. `timestamp_granularities[]` is `word` or `segment` (default
  `segment`), and it needs `verbose_json`.
- The guide states: "The `timestamp_granularities[]` parameter is only supported
  for `whisper-1`." `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` support `json`
  only.
- `verbose_json` has `text`, `language`, `duration`, `segments` and `words`. Each
  item of `words` is `{ word, start, end }`, with `start` and `end` in seconds.
- The file formats are flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav and webm. The
  guide states: "Files can be up to 25 MB." The API reference does not state the
  limit, and neither source defines MB. The app uses 25 000 000 bytes.
- The reference does not state CORS rules for a call from a browser.

Confirmed on 2026-11-24 for speaches, from its configuration page and its source
on the `master` branch (issue #101):

- The form field `timestamp_granularities[]` is read with `form.getlist`.
  `response_format` accepts `verbose_json`. `"word"` in the list sets
  `word_timestamps`, and `words` holds `{ start, end, word }` for each word.
- `ALLOW_ORIGINS` (a list, for example `'["*"]'`) adds `CORSMiddleware` with all
  methods and all headers. Unset, the server sends no CORS headers.
- `api_key` is unset by default. When it is set, each request needs the key.
- The configuration page states no file size limit.

Confirmed on 2026-11-24 for the browser, from MDN and the Chrome blog (issue #101):

- Mixed content: a `fetch` from an `https` page to an `http` URL is blocked. "Local
  resources are considered to be from secure origins", including
  `http://127.0.0.1/` and `http://localhost/`.
- CORS: "specifics about what went wrong with a CORS request are not available to
  JavaScript code". The page cannot tell a CORS refusal from no connection.
- `fetch` rejects with `AbortError` for an abort and `TypeError` for a network
  error. It gives no upload progress.
- `XMLHttpRequest.upload` sends `loadstart`, `progress`, `abort`, `error`, `load`,
  `timeout` and `loadend`. Upload handlers must exist before `send()`, and they
  make a cross-origin request send a preflight.
- `connect-src` controls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and
  `sendBeacon`. A scheme source such as `https:` needs the colon. A host source can
  have `*` as the port.
- Chrome 142 asks the person for the permission before a public page calls a local
  network address or a loopback address.

Confirmed on 2026-11-24 from the first stack in a real account (issue #7):

- AWS created the stack from `infra/hosting.yml`, with the two custom headers of
  the response headers policy.
- A repository can use immutable subject claims. The subject of its OIDC token is
  then `repo:<owner>@<owner id>/<name>@<repository id>:ref:refs/heads/main`, not
  `repo:<owner>/<name>:ref:refs/heads/main`. Read the prefix with
  `gh api repos/<owner>/<name>/actions/oidc/customization/sub`. A role that trusts
  the other form refuses the token: "Not authorized to perform
  sts:AssumeRoleWithWebIdentity".

Confirmed on 2026-11-24 for the CloudFront invalidation wait, from
`aws cloudfront wait invalidation-completed help` and
`aws cloudfront create-invalidation help` (aws-cli/2.37.9), the pages
https://docs.aws.amazon.com/cli/latest/reference/cloudfront/wait/invalidation-completed.html
and https://docs.aws.amazon.com/cli/latest/reference/cloudfront/create-invalidation.html,
and the service authorization reference above (issue #54):

- `create-invalidation` returns before the invalidation is complete. The
  invalidation id is at `Invalidation.Id` of the output.
- `wait invalidation-completed` needs `--distribution-id` and `--id`. It polls
  every 20 seconds and exits with code 255 after 30 failed checks, about 10
  minutes. It calls `GetInvalidation`.
- `cloudfront:GetInvalidation` has the access level Read and the required
  resource type `distribution`. `cloudfront:CreateInvalidation` has the access
  level Write and the same resource type.
- AWS has not validated the new permission on the stack.

Confirmed on 2026-11-24 for the singer models of issue #119, from the model cards,
the Hub API (`https://huggingface.co/api/models/<repo>?blobs=true`) and the source
of `@huggingface/transformers` 4.3.2 in `node_modules/@huggingface/transformers/src/`:

- `onnx-community/pyannote-segmentation-3.0`, commit
  `733a93b6473d019a773298e08cefa686894b1854`: MIT, not gated. `onnx/model.onnx` is
  5 986 908 bytes. The upstream `pyannote/segmentation-3.0` is MIT and gated
  (`gated: auto`).
- The library loads it with `AutoModelForAudioFrameClassification`
  (`PyAnnoteForAudioFrameClassification`) and `AutoProcessor` (`PyAnnoteProcessor`).
  The input is `input_values` with the shape `[1, 1, samples]` at 16 000 Hz. The
  output is `logits` with the shape `[1, frames, 7]`. A 10 s window gives 589
  frames. `preprocessor_config.json` sets `step` 270 and `offset` 990.
- The 7 classes, from `config.json`: `NO_SPEAKER`, `SPEAKER_1` to `SPEAKER_3`, and
  `SPEAKERS_1_AND_2`, `SPEAKERS_1_AND_3`, `SPEAKERS_2_AND_3`. The model card of
  https://huggingface.co/pyannote/segmentation-3.0 states 10 s windows, 3 speakers
  for each window and 2 at the same time. It states that the model "cannot be used
  to perform speaker diarization of full recordings on its own".
- `onnx-community/wespeaker-voxceleb-resnet34-LM`, commit
  `6a61a1833ff2583aabeba044f5c8221f00b67ceb`: CC BY 4.0, not gated.
  `onnx/model.onnx` is 26 535 549 bytes. The model type `wespeaker-resnet` loads with
  `AutoModel` (`WeSpeakerResNetModel`). `WeSpeakerFeatureExtractor` gives
  `input_features` with 80 log-mel bins for each 10 ms. The output is
  `last_hidden_state` with the shape `[1, 256]`. `ModelRegistry.get_files` logs a
  warning that it falls back to one `model.onnx` file for this type.
- `ModelRegistry.is_cached(repo, { revision, dtype, device })` expects
  `config.json`, `onnx/model.onnx` and `preprocessor_config.json` for each of the
  two models. So the engine loads the processor of the segmentation model too.
- `from_pretrained` with a `progress_callback` sends `progress` events with
  `name`, `file`, `loaded` and `total` for each file, and a `progress_total` event
  for the files of that one model.
- An HTTP error of the Hub gives an `Error` with a text from
  `src/utils/hub/constants.js`, for example `Could not locate file` for 404.
- The clustering values of the pyannote.audio 3.1 pipeline: `method: centroid`,
  `min_cluster_size: 12`, `threshold: 0.7045654963945799`, and
  `embedding_exclude_overlap: true`. Source:
  https://github.com/pyannote/pyannote-audio/blob/develop/tutorials/community/offline_usage_speaker_diarization.ipynb
  and `src/pyannote/audio/pipelines/clustering.py` (`AgglomerativeClustering`).
  The values are tuned on speech.
- Both hosts send CORS headers, as for the Whisper models. A `GET` with an
  `Origin` header answers `302` with `access-control-allow-origin: <origin>`, then
  `200` from `us.aws.cdn.hf.co` with `access-control-allow-origin: *`.
- No licence was found for the weights of the karaoke models (for example
  `UVR_MDXNET_KARA_2.onnx`), and no browser path is documented for them.
Confirmed on 2026-11-24 for the singer clustering of issue #137, from
`src/pyannote/audio/pipelines/clustering.py` on the `develop` branch of
https://github.com/pyannote/pyannote-audio, and from the source of
`@huggingface/transformers` 4.3.2:

- `AgglomerativeClustering.cluster` uses the small group size
  `min(min_cluster_size, max(1, round(0.1 * num_embeddings)))`. The `centroid`
  method scales the embeddings to unit length and uses the Euclidean distance.
- It cuts the dendrogram at the threshold. A group with `min_cluster_size` members
  or more is large. Each small group then joins the large group with the closest
  centroid. With one large group only, every embedding goes to that group.
- With `num_clusters` (the `num_speakers` of the pipeline), it walks the merges and
  keeps the cut whose count of large groups is closest to the count. Then the small
  groups join the closest large group.
- `filter_embeddings` keeps a local speaker for the clustering only when its frames
  with no other speaker are `min_active_ratio` of the window or more. The pipeline
  then gives each local speaker of a window a different group
  (`constrained_argmax`, `linear_sum_assignment`).
- `WeSpeakerFeatureExtractor` scales the samples by 32768, takes 80 Kaldi mel bins
  with a 25 ms Hamming window, a 10 ms hop, a pre-emphasis of 0.97 and no dither,
  and subtracts the mean of each bin. This is the input of the pyannote WeSpeaker
  wrapper. The engine gives it the mono samples at 16 000 Hz.

Confirmed on 2026-11-24 for vocal separation (issue #117). The measured numbers
are in `docs/adr/0008-vocal-separation-in-the-browser.md`.

- Spleeter 2-stem ONNX files of sherpa-onnx: `vocals.onnx` (39 318 336 bytes) and
  `accompaniment.onnx` (39 318 343 bytes). Each has the input `x` and the output
  `y`, float32, shape `[2, num_splits, 512, 1024]`: the channel, the split, 512
  frames and the first 1024 bins. Source: `onnxruntime-node` 1.30.0 session
  metadata of the files, and `export_onnx.py`.
- The input is the magnitude of an STFT with `n_fft` 4096, hop 1024, a Hann window
  and no centre padding, at 44 100 Hz. The vocals mask is
  `(v² + 1e-10 / 2) / (v² + a² + 1e-10)` of the two outputs. The bins at 1024 and
  above get the mask 0. Source: `offline-source-separation-spleeter-model-meta-data.h`
  and `offline-source-separation-spleeter-impl.h` (commit
  `716ba8317bb36cbcce9ac6c130396e8ec71b3c9c`).
- The metadata of the files states `sample_rate` 41000. sherpa-onnx ignores it and
  uses 44 100 Hz. The value is an error in the export script.
- The fp16 export (`csukuangfj/sherpa-onnx-spleeter-2stems-fp16`) ran on the `wasm`
  device but gave silence (energy ratio 0.000006). Use the fp32 files.
- Licence: the Spleeter repository is MIT, copyright Deezer SA. The weights are its
  `2stems.tar.gz` release asset (v1.4.0). The repository states no separate licence
  for the weights. The Hugging Face repository states no licence. sherpa-onnx is
  Apache-2.0.
- Demucs: https://github.com/adefossez/demucs README, section "License": "The
  license of the weights is not clear: MusDB contains some data that were only
  usable for research purpose." The `demucs` npm package (bakkot/demucs-js)
  states that its `htdemucs.onnx` "is made available for personal and research
  use only". So the issue statement that the `htdemucs` weights have the MIT
  licence is not confirmed.
- `huggingface.co/<repo>/resolve/<commit>/<file>` answers `302` with
  `access-control-allow-origin: <origin>`, then `us.aws.cdn.hf.co` answers with
  `access-control-allow-origin: *`. Checked with an `Origin` header for each model
  file of the measurement. A URL with a commit id stays the same file.
- `onnxruntime-web/wasm` loads `ort-wasm-simd-threaded.wasm`, a different file than
  the `asyncify` file of the transcribe worker. The separate worker sets
  `env.wasm.wasmPaths.wasm`, so the runtime fetches the file from the app origin.
- `InferenceSession.create(buffer: ArrayBufferLike, options?)` and
  `session.run(feeds)` return a map of output name to `Tensor`. A failed
  allocation in the WASM runtime rejects with a text that contains
  `std::bad_alloc`.
- Cache API: `caches.open(name)`, `cache.match(url)` gives `undefined` for no
  entry, `cache.put(url, response)` stores a response. The engine stores a file
  only after a complete download with the correct size.

Confirmed on 2026-11-24 for the vocal separation model files and the browser
cache (issue #117):

- The Hub API lists the files of a commit:
  `https://huggingface.co/api/models/csukuangfj/sherpa-onnx-spleeter-2stems/tree/7001ba316a615cacddb3f9ef3ec416661a277e26`.
  Each Git LFS file has `lfs.oid` and `lfs.size`. The LFS object id is the SHA-256
  of the file, so the app reads the expected hash without a download.
- `vocals.onnx`: `lfs.size` 39318336, `lfs.oid`
  `bdc16ab6bf6117ddd4842c19e80e40e2be188fc555295064d424616b0224ac97`.
  `accompaniment.onnx`: `lfs.size` 39318343, `lfs.oid`
  `671ace17acd3720674a2bc14de32ac6292453dec20d9eb0ba4255d4ad8e3d8c0`.
- `crypto.subtle.digest('SHA-256', data)` accepts an `ArrayBuffer`, a typed array
  or a `DataView`, and fulfills with an `ArrayBuffer`. It works in a Web Worker and
  needs a secure context. Source:
  https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest (last
  modified 2025-12-28).
- `Cache.put()` returns a promise. The MDN page names only a `TypeError` for a URL
  that is not `http` or `https`. Source:
  https://developer.mozilla.org/en-US/docs/Web/API/Cache/put (last modified
  2025-06-24). The page does not state a quota error, so the app treats each
  rejection of a cache call as no cache.

Confirmed on 2026-11-24 for Demucs (issue #122). These facts come from the documents
and from the runs of issue #117; not run again for issue #122. The maintainer
stopped all model runs on the development computer.

- `demucs-web` 1.0.2 ships `src/*.js` and no type file. The app declares the types
  of the README API section in
  `src/features/vocal-separation/engine/demucs-web.d.ts`. The npm package source is
  the same file for file as the package of the #117 measurement.
- `new DemucsProcessor({ ort, sessionOptions, onProgress })`. `ort` is the ONNX
  runtime module. The package imports no runtime of its own.
- `loadModel(pathOrBuffer)` accepts an `ArrayBuffer` (an `instanceof ArrayBuffer`
  check) and then calls `ort.InferenceSession.create(buffer, { executionProviders:
  ['webgpu', 'wasm'], graphOptimizationLevel: 'basic', ...sessionOptions })`.
- `separate(left, right)` takes two `Float32Array` channels at 44 100 Hz. It
  returns `{ drums, bass, other, vocals }`, each `{ left, right }` with the length
  of the input.
- `onProgress({ progress, currentSegment, totalSegments })` comes after each
  segment. A segment has 343 980 samples (`TRAINING_SAMPLES`), and a new segment
  starts each `floor(343980 × 0.75)` samples. `totalSegments` can be lower than
  the real count for a short input, so the app converts `currentSegment` to audio
  time itself.
- The README documents the `webgpu` device: the default `executionProviders` are
  `['webgpu', 'wasm']`, and its example checks `navigator.gpu.requestAdapter()`.
- ONNX Runtime Web: `import * as ort from 'onnxruntime-web/webgpu'` and
  `executionProviders: ['webgpu']` select WebGPU (ep-webgpu page above). The
  `webgpu` build loads `ort-wasm-simd-threaded.asyncify.wasm`
  (`wasm-utils-import.ts`: `DISABLE_JSEP` with WebGPU on gives the `asyncify`
  file). The page does not state an automatic fallback, so the engine runs again
  on `wasm` itself.
- The model file of commit `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d`:
  `lfs.size` 180534758, `lfs.oid`
  `e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077`, from
  https://huggingface.co/api/models/timcsy/demucs-web-onnx/tree/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d .
  The Hub sends CORS headers for the file (run of issue #117).
- The #117 runs: `wasm` with 2 threads, 0.55 to 0.77 audio seconds for each
  second of run, 4.03 to 4.46 GB peak for one process. A session with graph
  optimization `all` of another Demucs export failed with `std::bad_alloc`.
- Licence: the Demucs code is MIT. The README of Demucs states: "The license of the
  weights is not clear: MusDB contains some data that were only usable for
  research purpose." The Hugging Face repository states no licence. The maintainer
  accepted this on 2026-11-24.

Evidence format:

```
Verified against: https://huggingface.co/docs/transformers.js/api/pipelines (4.3.2, retrieved 2026-11-24)
Verified against: `aws s3 sync help` (aws-cli/2.37.9)
```

Anything that creates, deletes or changes an AWS resource is confirmed with the
user first. Read-only `list-*`, `get-*` and `describe-*` calls are the safe way to
learn the shape of a real resource.
