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

## Changes after the batch review (2026-11-24)

The documentation gives these facts (retrieved 2026-11-24):

- `play()` rejects with `NotAllowedError` when the browser does not allow the play
  in the current context (MDN, `HTMLMediaElement/play`, last modified 2025-09-18).
  The autoplay rules apply to a `play()` call "outside the context of handling a user
  input event". On some browsers, an action on one element allows the play of that
  element only (MDN, Autoplay guide, last modified 2026-09-10).
- A hidden page gets no animation frames. Firefox runs a timer of an inactive tab
  at most one time each second. Chrome runs a timer close to its interval while the
  page "has made sound recently" (MDN, `Window/setTimeout`, last modified
  2026-10-26).

Decisions:

- One mixer lives as long as the song audio. `update` gets the followers and the
  rows that sound in one call. A follower with the same row and the same element
  keeps its play, so a phrase edit that changes the ranges of a singer row does not
  unmute "Song" and does not restart a track. Only `destroy` unmutes the song
  audio: when the editor closes the song or the song audio changes. With no track
  rows, the song audio always sounds.
- A click on "Mute" or "Solo" of a row calls `activate` in the click handler. If
  the row sounds and the song audio plays, the follower starts in the click. If the
  song audio is paused, the follower gets a muted `play()` and a `pause()` in the
  click, so the browser can start that element later.
- After `NotAllowedError`, the mixer stops the tries for that row. The group shows
  one message for the row. The next click on "Mute" or "Solo" of the row tries
  again. Another rejection, for example `AbortError` after a quick pause, shows no
  message, and the next check tries again.
- While the page is hidden, a timer of 50 ms (`HIDDEN_CHECK_MS`) checks the
  followers in place of the animation frames. The animation frames come back when
  the page shows. `destroy` removes the timer and the `visibilitychange` listener.

Consequences:

- In Chrome, a page that plays sound keeps timers close to 50 ms, so a singer row
  sounds at most about 50 ms outside its ranges in a hidden tab.
- In Firefox, a hidden tab can run the timer at most one time each second. Then a
  singer row can sound up to about 1 second outside its ranges, and the follower can
  drift for up to 1 second before a `timeupdate` check. The app does not solve this
  limit. An `AudioContext` would remove the throttle in Firefox, but this ADR keeps
  the media elements.
- A browser that needs an action for each element (for example Safari on iOS) was
  not tested on a real device. The prime in the click follows the MDN text above.
