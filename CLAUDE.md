# xLights Singing Face Timing Generator

The app is a browser-only web application. The person loads an audio file of a
song. The app transcribes the song with a Whisper speech model in the browser,
breaks down each word into xLights phonemes, and exports an `.xtiming` file with
three layers (phrases, words, phonemes) for each voice. The xLights Faces effect
reads the phoneme layer. No audio leaves the browser.

Current state: the spec is approved. No application code exists yet. Epic 0
(Foundation) creates the scaffold.

## Design

Design lives in `docs/specs/`. Read `docs/specs/spec.md` and the relevant
`docs/specs/features/*.md` before you build a feature. Use the words in the
`## Terms` table of `docs/specs/spec.md`. Mockups in `docs/specs/mockups/` are
guidance, not a contract.

After you edit a spec file, run `python3 docs/specs/render-spec.py`. Do not edit
`docs/specs/spec.html` or `docs/specs/html/` by hand.

## Stack

- React 19, TypeScript 7 (strict), Vite 8.
- Zustand 5 for the song store and the undo history.
- wavesurfer.js 8 for the waveform and audio play.
- `@huggingface/transformers` 4 in a Web Worker for the speech model.
- IndexedDB (native API) for songs, audio files and the custom dictionary.
- Vitest for unit and component tests. Playwright for E2E tests.
- Hosting: private S3 bucket behind CloudFront, declared in `infra/hosting.yml`.
  GitHub Actions deploys each commit on `main` through GitHub OIDC.

## Layout

- `src/app/` — shell, hash routes, theme.
- `src/features/<feature-id>/` — one folder for each feature set in the spec.
- `src/lib/` — pure modules: `xtiming/`, `dictionary/`, `time/`. No browser API.
- `src/store/` — the song store and the history stack.
- `src/workers/` — Web Workers.
- `tests/e2e/`, `tests/fixtures/` — Playwright tests and golden `.xtiming` files.
- `public/demo/`, `public/dict/` — the demo song and the built dictionary.
- `infra/` — CloudFormation. `scripts/` — build scripts.
- `docs/adr/` — decision records. `docs/external.md` — facts outside the code.

Unit tests sit beside the source file as `<name>.test.ts`.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` |
| Start locally | `npm run dev` (http://localhost:5173) |
| Unit and component tests | `npm test` |
| E2E tests | `npm run test:e2e` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Format | `npm run format` |
| Build | `npm run build` |
| Render the spec site | `python3 docs/specs/render-spec.py` |

## Conventions

- Branch model: trunk. Every change reaches `main` through a pull request. A
  commit on `main` deploys to production.
- The xLights format rules are fixed. Read `docs/specs/features/06-xtiming-export.md`
  before you change `src/lib/xtiming/`. Every timing track has exactly three
  `<EffectLayer>` elements. Every time is a multiple of the frame size.
- Phoneme labels are case-sensitive: `AI`, `E`, `etc`, `FV`, `L`, `MBP`, `O`,
  `rest`, `U`, `WQ`.
- Pure logic goes in `src/lib/` or in store actions, with unit tests. Components
  hold no timing logic.
- Every store action that changes marks, voices or sections is one undo step.
- Each failure shows a message that states the cause and the next action. The copy
  is in the feature files.
- Read the documentation of an external library or service before you call it.
  See `.claude/rules/external-apis.md`.
- Any command that creates, changes or deletes an AWS resource needs the user's
  confirmation first.
- Prose, issue bodies and code comments use Simplified Technical English. See
  `.claude/rules/ste.md`.
- Commit messages: imperative mood, one subject line of 72 characters or fewer.

## When to file an issue

- **A finding earns a tracker issue in five cases, and never otherwise.** Behavior.
  A user-visible output. A guard that guards nothing. A blocked epic. A question
  the maintainer must rule. One carve-out: anything under `docs/specs/` that
  describes the wrong product earns a spec-update issue, because the spec decides
  what gets built.

  **Every other finding is repaired by the change set that found it, and no issue
  is filed.** A falsified sentence, a moved citation, a stale count, a missing term
  and prose drift each reach the repair. A repair that turns out to touch behavior
  stops and is filed as a behavior finding.

  Where the repair goes:
  - Found while building an issue → that issue's own PR, limited to files it
    already touches.
  - Found at review of a batch's integration branch → a documentation commit on
    that branch, before the CI-trigger commit.
  - Found with nothing open → a line in `docs/TODO.md`, taken by the next batch.

- A changelog or spec-changelog entry records a **decision**, made at a batch gate.
  No rule, hook, CI check, or test may require a changelog row, a spec edit, or a
  docs-accuracy pass **per change set or per batch member** — a batch that shipped
  as planned earns no line. A test that asserts per-member bookkeeping agreement
  re-creates the churn the filing gate exists to prevent, and fails review here.
