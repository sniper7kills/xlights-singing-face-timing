# 0007 — Send the audio to a remote endpoint that the person selects

Date: 2026-11-24
Status: accepted

## Context

The maintainer asked for "an API call ability to go to a whisper endpoint" (issue
#101). A run in the browser is slow on a computer with no fast graphics card. The
main target is a self-hosted server of the maintainer. Until now, the spec
promised that no audio leaves the browser (`docs/adr/0002`).

The app has no server, so the browser must call the endpoint directly. Three facts
of the browser shape the design:

- A page from an `https` address cannot call an `http` address, except a loopback
  address such as `http://localhost`.
- A CORS refusal and no connection give the page the same error.
- The Content-Security-Policy `connect-src` of the hosting allowed only the app and
  the Hugging Face Hub.

## Decision

- The person can select "Remote endpoint" in the transcribe dialog. The endpoint is
  compatible with the OpenAI transcription API: `POST <base URL>/audio/transcriptions`
  with `response_format=verbose_json` and `timestamp_granularities[]=word`.
- The browser speech model stays the default. A lyrics-only run never sends audio.
- The dialog shows the host before each remote run. The new promise is: audio
  leaves the browser only when the person selects a remote endpoint, and the app
  shows the host first.
- The app sends 16-bit PCM WAV at 16 kHz with one channel. The app already makes
  these samples for the speech model, and the API accepts `wav`. The limit of
  25 MB is about 13 minutes. The app has no encoder for a compressed format, and a
  WAV file needs no new library. A longer song uses a range run.
- The app uses `XMLHttpRequest`, because `fetch` gives no upload progress.
- The API key is optional. It stays in the IndexedDB settings and goes only in the
  `Authorization` header to the base URL.
- `connect-src` changes from
  `'self' https://huggingface.co https://*.huggingface.co https://*.hf.co` to
  `'self' https: http://localhost:* http://127.0.0.1:*`. The other directives do not
  change.

## Consequences

- `connect-src` no longer stops an injected script from sending data with `fetch`
  to any `https` address. The other directives still protect the app:
  `script-src 'self' 'wasm-unsafe-eval'` blocks inline script and script from
  other hosts, so an injected script is less likely to run. `default-src 'self'`
  covers the other resource types.
- A server on the local network needs `https`, or the page must come from `http`
  (for example `npm run dev`). The dialog states this rule and blocks "Start" for
  a mixed content address.
- The server must allow the origin of the app in its CORS settings, and it must
  answer the CORS preflight. The message for a failed call names the header
  `Access-Control-Allow-Origin` with the origin of the app.
- From Chrome 142, Chrome asks the person before a public page calls `localhost`
  or the local network.
- The OpenAI speech models `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` return
  no word times. The app shows the message for a response with no `words` list.
- No test calls a real endpoint. The maintainer checks a real server by hand.
