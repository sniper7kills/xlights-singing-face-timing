# 0003 — Compile with TypeScript 7, lint with the TypeScript 6 API

Date: 2026-11-24
Status: accepted

## Context

The spec pins TypeScript 7 in strict mode. TypeScript 7.0.2 ships no compiler API
for JavaScript tools. `typescript-eslint` 8.74.0 needs that API and accepts
`typescript >=4.8.4 <6.1.0` only. The upstream issue is open and blocked. Two
options existed: use TypeScript 6 for everything, or keep the TypeScript 7 compiler
and give ESLint the TypeScript 6 API.

## Decision

`package.json` has two npm aliases. `@typescript/native` is `typescript@~7.0.2`
and supplies the `tsc` binary for `npm run build` and `npm run typecheck`.
`typescript` is `@typescript/typescript6@^6.0.2` and supplies the API that ESLint
loads. This is the setup in the TypeScript 7.0 announcement.

## Consequences

- The project compiles and typechecks with TypeScript 7, as the spec requires.
- ESLint parses the source with TypeScript 6. A syntax that only TypeScript 7
  accepts fails lint.
- Two packages supply a `tsc` binary. The npm link order decides which one is
  `node_modules/.bin/tsc`. With the alias name `@typescript/native`, a fresh
  `npm ci` gives TypeScript 7. Another alias name gave TypeScript 6 in a test.
  Do not rename the alias. Check `npx tsc --version` after a dependency change.
- `npm ls` marks `@typescript/native` as an invalid optional peer. `npm ci` and
  `npm ls` still exit 0.
- When `typescript-eslint` supports TypeScript 7, remove both aliases and
  supersede this record.
