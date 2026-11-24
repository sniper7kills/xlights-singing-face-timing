---
name: test
description: Run the test suites. Use when asked to test, verify or check a change,
  or before you open a pull request.
allowed-tools: Bash, Read
---

# Test the app

Run these in order. Stop at the first failure and fix it.

1. `npm run lint`
2. `npm run typecheck`
3. `npm test` — Vitest unit and component tests.
4. `npm run build`
5. `npm run test:e2e` — Playwright tests against the built app.

If Playwright reports a missing browser, run `npx playwright install chromium`.

## Which suite covers what

- A change in `src/lib/` or `src/store/`: unit tests beside the file.
- A change in `src/lib/xtiming/`: the golden files in `tests/fixtures/` must match
  byte for byte. If the format changes on purpose, read
  `docs/specs/features/06-xtiming-export.md` first, then update the golden file in
  the same change.
- A change in a component: a component test, plus the E2E flow that uses it.
- The E2E tests replace the transcribe worker with a fixture. They do not download
  a speech model.

A change that affects the exported file also needs the manual check in the
`xlights-import-check` skill.
