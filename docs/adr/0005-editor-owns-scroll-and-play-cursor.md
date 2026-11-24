# 0005 — The editor owns the scroll offset and the play cursor

Date: 2026-11-24
Status: accepted

## Context

The editor shows the waveform and three layers of marks on one time axis. Zoom,
scroll and the play cursor must agree on every row. wavesurfer.js 8 has its own
scroll container, zoom and cursor. Two owners of the same value gave rows that did
not line up.

## Decision

The view store holds the zoom, the scroll offset, the play time and the stage
width. `timeScale.ts` converts between time and pixels for every row. The editor
draws its own play cursor. wavesurfer.js only draws the waveform and plays the
audio, behind the adapter `waveformPlayer.ts`.

## Consequences

- The waveform, the time ruler and the layers use one scale, so a mark is always
  under its sound.
- Zoom and scroll are view state. They are not undo steps.
- A component test of the layers must set the stage width in the view store.
- A new version of wavesurfer.js can change its scroll or cursor with no effect on
  the editor.
