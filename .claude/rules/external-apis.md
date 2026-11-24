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
| xLights `.xtiming` format | commit `99a289bf` | https://github.com/xLightsSequencer/xLights — `src-core/render/Element.cpp`, `src-ui-wx/sequencer/RowHeading.cpp`, `src-core/render/SequenceFile.cpp`, `src-core/effects/FacesEffect.cpp` |
| xLights manual | current | https://manual.xlights.org/xlights/chapters/chapter-four-sequencer/singing-faces.md |
| AWS CloudFormation (S3, CloudFront, IAM) | current | https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/ |
| AWS CLI | 2.x | `aws s3 sync help`, `aws cloudfront create-invalidation help` |
| GitHub OIDC with AWS | current | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html |
| OpenAI transcription API | current | https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create , https://developers.openai.com/api/docs/guides/speech-to-text |
| speaches (faster-whisper-server) | `master` branch | https://speaches.ai/configuration/ , https://speaches.ai/usage/speech-to-text/ , source `src/speaches/routers/stt.py`, `src/speaches/executors/whisper.py`, `src/speaches/main.py` |
| Mixed content, CORS errors, `XMLHttpRequest.upload`, `fetch`, CSP `connect-src` | browser | https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content , https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors , https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload , https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch , https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src |
| Chrome Local Network Access | Chrome 142 | https://developer.chrome.com/blog/local-network-access |

Not confirmed yet. Confirm each one before the code that depends on it:

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

Evidence format:

```
Verified against: https://huggingface.co/docs/transformers.js/api/pipelines (4.3.2, retrieved 2026-11-24)
Verified against: `aws s3 sync help` (aws-cli/2.37.9)
```

Anything that creates, deletes or changes an AWS resource is confirmed with the
user first. Read-only `list-*`, `get-*` and `describe-*` calls are the safe way to
learn the shape of a real resource.
