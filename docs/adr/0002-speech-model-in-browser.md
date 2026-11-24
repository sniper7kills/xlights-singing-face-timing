# 0002 — Run the speech model in the browser

Date: 2026-11-24
Status: accepted

## Context

The app must find each sung word and its time. Three options existed: a paid cloud
speech service, a Whisper speech model in the browser, and manual lyrics with
forced alignment. The user chose the Whisper speech model in the browser.

## Decision

The app runs a Whisper speech model with `@huggingface/transformers` in a Web
Worker. The app uses WebGPU when the browser has it, and WASM when it does not. The
app offers the tiny, base and small speech models. The person can paste lyrics, and
the app aligns the transcribed words with them.

## Consequences

- The app needs no backend, no API key and no payment.
- No audio leaves the browser.
- The first use downloads a speech model of tens to hundreds of megabytes.
- Accuracy on sung words over music is lower than on speech. The lyrics align flow
  and the editor carry the correction.
- Speed depends on the person's computer.
- The speech model gives word times only. The app spreads phonemes inside a word
  by weight.
