# 0006 — Cross-origin isolation for wasm threads, and a device from measured speeds

Date: 2026-11-24
Status: accepted

## Context

The page was not cross-origin isolated. The browser then gives no
`SharedArrayBuffer`, and the ONNX runtime uses 1 thread on the `wasm` device. The
app also selected `webgpu` when an adapter existed. An integrated Intel graphics
card ran the tiny speech model about 4 times slower on `webgpu` than on `wasm`.

Issue #93 measured the speed of a production build with the two headers below. The
audio was the demo song 6 times, 173.4 s. The machine had 12 logical cores. The
browsers were headless Playwright Chromium and Firefox 159. The values are seconds
of audio for each second of run, one value for each run.

| Browser | Speech model | 1 thread | 2 threads | 4 threads | 8 threads |
|---|---|---|---|---|---|
| Chromium | tiny | 3.37, 3.45, 3.49 | 4.27, 4.54 | 4.06, 4.12, 4.20 | 3.75 |
| Chromium | base | 1.85, 2.30, 2.31 | 3.23, 3.40 | 2.17, 3.11, 3.21 | 3.25, 3.45 |
| Firefox | tiny | 3.00, 3.03 | 3.94, 3.96 | 3.55 | 3.26 |
| Firefox | base | 1.58, 1.88 | 2.72, 2.73 | 2.22 | 2.43 |

With 2 threads, base is 1.44 to 1.58 times faster, and tiny is 1.28 to 1.31 times
faster. The range comes from the median or the mean of the 1-thread runs. Other
processes ran on the machine, so one run can be slow. 4 and 8 threads were never
faster than 2 threads. The ONNX runtime default with isolation is
`min(4, ceil(cores / 2))`, which is 4 threads here.

Headless Chromium and headless Firefox had no WebGPU adapter, so the runs measured
no `webgpu` value.

## Decision

The app sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` from the dev server, the preview server
and the CloudFront response headers policy. The issue rule asks for a gain of 1.5
times or more. Base, the default speech model, reaches it in Firefox and is at the
limit in Chromium. The headers cost no blocked request today.

The worker sets `numThreads` to `min(2, hardwareConcurrency)` when it is
cross-origin isolated (`MAX_WASM_THREADS` in `threads.ts`). Without isolation, the
worker keeps the library default.

The value is `require-corp`, not `credentialless`. Safari does not support
`credentialless`. The speech model downloads use `fetch` in `cors` mode, and the
Hugging Face hosts send `Access-Control-Allow-Origin`, so `require-corp` lets them
through.

The device comes from measured speeds, not from the presence of an adapter:

- The client reports the speed of each run with 30 s of audio or more.
- The settings store keeps the latest speed for each speech model and device in
  `AppSettings.deviceSpeeds`, for this browser.
- With no stored speed, the run uses `wasm`. The next run uses `webgpu` one time,
  if an adapter exists. After that, each run uses the faster device.
- A failed or stalled `webgpu` run stores the speed 0, so the app does not select
  `webgpu` again for that speech model.

A warm-up run on each device was not used. Whisper pads each pass to a 30 s
window, so a fair warm-up costs about one chunk on each device: about 9 s for tiny
and 15 s for base on 1 thread. The first `webgpu` pass also compiles its shaders,
so a short warm-up favours `wasm`. A real run is the fair measurement.

## Consequences

- base transcribes a 4-minute song in about 90 s instead of about 140 s on `wasm`
  in Firefox. tiny gains less.
- Every future resource from another origin needs CORS or a
  `Cross-Origin-Resource-Policy` header. A `fetch` in `cors` mode to any host
  passes `require-corp` when that host sends `Access-Control-Allow-Origin`. An
  `<img>`, `<audio>` or `<script>` from another origin without CORS or CORP is
  blocked.
- A browser that does not isolate the page keeps 1 thread and the app still works.
- A browser with a fast graphics card runs one `wasm` run before it uses `webgpu`.
  A slow graphics card costs one slow run, and the watchdog of issue #91 still stops
  a run with no progress for 45 s.
- AWS has not applied the response headers policy yet. The first deployment checks
  that CloudFront accepts the two custom headers.
- Firefox refuses some ports, for example 4190. A local check in Firefox needs
  another port.
