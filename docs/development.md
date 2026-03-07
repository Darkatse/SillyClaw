# Development Guide (SillyClaw)

This document describes how to work on SillyClaw as a plugin project: local setup, repo structure, and development invariants.

Related:

- Constraints: `docs/project-constraint-guidelines.md`
- Architecture: `docs/architecture-design.md`
- PRD/Roadmap: `docs/prd-and-roadmap.md`
- Data formats: `docs/data-formats.md`

## Philosophy (current)

- Prefer **small, explicit primitives**: parse → normalize → compile → inject.
- Prefer **fail-fast** behavior during development: schema/import mismatches throw with clear messages.
- Keep injection logic as close to **pure string assembly** as possible.
- Avoid “smart” behavior that couples to OpenClaw internals (message lists, context engines, tool side effects).

## Prerequisites

- Node.js `>= 22.12.0` (see `package.json` `engines.node`)
- npm

## Commands

```bash
npm install
npm run typecheck
npm test
npm run test:watch
```

Notes:

- Type checking includes both runtime code (`tsconfig.json`) and tests (`tsconfig.test.json`).
- Tests run via Vitest and only include `test/**/*.test.ts` to avoid traversing symlinked repos.

## Developing against OpenClaw

SillyClaw is a Gateway plugin loaded in-process by OpenClaw.

Typical local workflow (link install):

```bash
openclaw plugins install -l /path/to/SillyClaw
openclaw plugins enable sillyclaw
```

Then configure under `plugins.entries.sillyclaw.config` (see `openclaw.plugin.json`):

- `dataDir`: where SillyClaw stores `state.json`, presets, and stacks.
- `debug`: verbose SillyClaw logs (safe summaries only).

Restart the Gateway when changing plugin code/config unless your OpenClaw setup supports live reload.

## Repo layout

- `index.ts`: plugin entrypoint (registers CLI and `before_prompt_build` hook)
- `openclaw.plugin.json`: plugin manifest + config schema
- `src/config.ts`: resolves plugin config (`dataDir`, `debug`)
- `src/runtime.ts`: runtime orchestration (state resolution, injection, CLI operations)
- `src/store.ts`: filesystem store (atomic JSON writes; loads validate via schema parsers)
- `src/schema.ts`: v1 schema parsers (“migration layer”)
- `src/import/sillytavern.ts`: SillyTavern preset importer (input formats only)
- `src/compile.ts`: deterministic compilation of stacks → `{ prependSystemContext, prependContext }`
- `src/cli.ts`: `openclaw sillyclaw ...` command surface
- `test/*.test.ts`: unit tests (Vitest)

## Key invariants to keep stable

- Injection only uses:
  - `prependSystemContext`
  - `prependContext`
- `system.append` / `appendSystemContext` is deferred; compilation throws if an enabled `system.append` block exists.
- Macro substitution is limited to `{{char}}` and `{{user}}` only.
- Diagnostics should not dump prompt bodies by default (prefer ids, names, and character counts).
- Stored JSON must remain versioned (`schemaVersion`) and parsable via `src/schema.ts`.

## Tests

### What we test

- Import mapping (`src/import/sillytavern.ts`): supported shapes, ordering, marker skipping, target mapping.
- Compilation (`src/compile.ts`): deterministic order, block skipping, macro substitution/missing macros, deferred features.
- Runtime (`src/runtime.ts`): active stack precedence (`session > agent > default`), state cleanup on delete, diagnostics safety.
- Schema parsing (`src/schema.ts`): supported versions and type checks.

### What we intentionally avoid

- Tests that depend on a running OpenClaw gateway.
- Tests that traverse the symlinked `openclaw/` or `SillyTavern/` trees.

## Making changes safely

- If you change a stored JSON shape, bump `schemaVersion` and add a parser for the new version in `src/schema.ts`, with tests.
- If you change import semantics, add importer tests that lock in the new behavior.
- If you add new CLI flags/commands, update `README.md` and add at least one focused runtime test for the behavior.

