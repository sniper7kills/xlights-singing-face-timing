---
paths:
  - "src/**/*.{ts,tsx}"
  - "tests/**/*.{ts,tsx}"
  - "scripts/**/*.{mjs,sh}"
---

# Quality rules — reviewed per rule, pass or fail

- No try/catch that only rethrows, or logs and continues.
- No defensive casts or null checks against states the types already exclude.
- No abstraction with a single caller. Inline it until a second caller exists.
- No configuration for a value nothing varies.
- No dead code and no commented-out code.
- A comment states what the code cannot (see the STE rule). Delete comments that
  restate the code.
- No `any` and no non-null assertion (`!`) in `src/`.
- No timing logic in a React component. Snap, clamp, spread and overlap rules live
  in `src/lib/` or in a store action, with a unit test.
- No module in `src/lib/` imports React, the DOM, IndexedDB or a Web Worker.
- Every change to marks, voices or sections goes through a store action that
  records one undo step.
- Every time that reaches `src/lib/xtiming/` is a whole number of milliseconds.
- No network request with audio, lyrics or marks in the body or the URL. The one
  exception is the audio of a remote run, to the remote endpoint that the person
  selected.
- No API key in a log, an error message, an export, a URL or a test snapshot.
- No string that the person supplies reaches XML without `escapeXml`.
- Each message that the person sees matches the copy in the feature file.
