# 0010 — Each audio track plays in a media element that follows the song audio

Date: 2026-11-24
Status: accepted

## Context

A run with the vocal separation keeps the vocals and the instruments (issue #129).
The person mutes and soloes each audio track in the editor (issue #130). Each track
must stay in time with the play cursor through play, pause, a seek, a loop and the
play speeds 50%, 75% and 100%, and the pitch must not change. ADR 0005 makes the
editor the owner of the play time, and wavesurfer.js plays the song audio in one
media element.

The documentation gives these facts (retrieved 2026-11-24):

- `HTMLMediaElement.preservesPitch` is `true` by default and keeps the pitch at a
  different `playbackRate` (MDN, `HTMLMediaElement/preservesPitch` and
  `HTMLMediaElement/playbackRate`).
- `AudioBufferSourceNode.playbackRate` resamples the audio, so the pitch changes
  with the speed. The node has no setting that keeps the pitch (MDN,
  `AudioBufferSourceNode/playbackRate`).
- The browser sends `timeupdate` from about 4 to 66 times each second (MDN,
  `HTMLMediaElement/timeupdate_event`). A set of `currentTime` starts a seek and
  sends `seeking` (MDN, `HTMLMediaElement/seeking_event`).
- `play()` returns a promise that rejects with `NotAllowedError` under the
  autoplay policy. A muted element and a page with an action of the person may
  play (MDN, Autoplay guide).
- wavesurfer.js 8.1.1 plays in a media element by default.
  `getMediaElement()` returns it. `setTime` sets `currentTime`, and
  `setPlaybackRate(rate, true)` sets `playbackRate` and `preservesPitch`
  (`dist/wavesurfer.d.ts`, `dist/player.js`).

## Decision

The media element of wavesurfer.js stays the leader. Each track row has one
`<audio>` element, the follower, with a Blob URL of a WAV file of the stored
16-bit samples (`trackToWav`). The track mixer (`trackMixer.ts`) listens to the
leader:

- `play`, `pause`, `seeking`, `seeked` and `timeupdate` start a check of each
  follower, and so does each animation frame during play.
- `ratechange` copies `playbackRate` and `preservesPitch` to each follower.
- A check applies `followerAction` (`src/lib/audio/trackMix.ts`). A follower plays
  only while the leader plays, its row sounds and the song time is inside its
  track. A follower moves to the leader time when it starts, and when the
  difference is more than 50 ms (`DRIFT_LIMIT_MS`). 50 ms is one frame of the
  longer frame size. A smaller limit gives more short gaps in the sound.
- A range track plays at the song time minus its `startMs`, and pauses outside
  its range.
- A singer row has its own follower with the vocals file. The follower is muted
  outside the ranges of its singer.
- A row that does not sound pauses its follower. With "Song" muted, the leader
  plays muted, so it still moves the play time.

The app creates no `AudioContext`. A follower starts in the `play` event of the
leader or in a later check, after the action of the person on "Play". A refused
`play()` leaves the follower paused, and the next check tries again. The editor
draws the waveform of each row on its own canvas from peaks of the samples
(`src/lib/audio/peaks.ts`), with no wavesurfer.js instance for each row.

## Consequences

- The play speed keeps the pitch on each track, because each track is a media
  element.
- The play time stays one value: the time of the leader. The play cursor, the
  loop and the face preview do not change.
- Two media elements do not share a clock, so a follower can be up to 50 ms from
  the leader before a check moves it. A move gives a short gap in the sound of
  that track. A headless Chromium run measured a difference of 40 ms or less at
  100% and at 50%.
- The page holds at most one leader, two track followers and one follower for
  each singer row. A follower that does not sound is paused.
- A Web Audio graph would give one clock and exact time, but it would change the
  pitch at 50% and 75%. The project gives up the exact time to keep the pitch.
