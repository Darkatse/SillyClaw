# PRD and Phased Implementation Roadmap (SillyClaw)

## Problem statement

OpenClaw’s current “prompt control” is primarily file-based (`SOUL.md`, `AGENTS.md`, etc.) and not designed for **rapid persona/prompt switching** or **layered role-playing presets**.

SillyClaw aims to bring a subset of SillyTavern’s preset workflow into OpenClaw by:

- importing SillyTavern preset JSON as an input format,
- converting it into SillyClaw-managed JSON for day-to-day use,
- applying presets (ideally as stacks) through OpenClaw’s typed plugin hooks,
- preserving OpenClaw’s kernel system prompt and core agent behavior.

## Goals

1. **Import compatibility:** ingest SillyTavern presets and retain prompt text + prompt order.
2. **Stable injection:** compile presets into:
   - `prependSystemContext` (system-space overlay), and
   - `prependContext` (user-prompt prefix overlay).
3. **Manageability:** treat “presets as stacks” so operators can build reusable combinations.
4. **Minimal intrusion:** no context-engine, no message-list modification, no system prompt override.
5. **Macro support:** support `{{char}}` and `{{user}}` with explicit mapping.

## Non-goals (initial releases)

- Full SillyTavern prompt-manager semantics (markers, in-chat injection depth/order, floating prompts as inserted system messages).
- Generation parameter parity (temperature/top_p/etc) across providers.
- Automatic tool/skills allowlist changes based on preset.
- Any “automation” that executes tools or writes files as part of preset application.
- Supporting macros beyond `{{char}}` / `{{user}}`.

## Target users

- OpenClaw operators who want **some role-playing capability** while still using OpenClaw primarily as an agentic gateway.

## Core user stories

1. As an operator, I can **import a SillyTavern preset** and see it stored as a SillyClaw preset layer.
2. As an operator, I can **create a stack** by combining multiple layers (base style + character).
3. As an operator, I can **activate a stack** for a session (and optionally set a global default).
4. As an operator, I can **set `{{char}}`/`{{user}}` mappings** so imported prompts render correctly.
5. As an operator, I can **verify what was injected** (stack id + sizes) without dumping the full prompt.

## Functional requirements

### Preset import

- Accept SillyTavern preset JSON files.
- Extract prompt text + enabled order.
- Map:
  - “before main prompt” → `prependSystemContext`
  - “after chat history” → `prependContext`
- Produce a SillyClaw preset-layer JSON file with:
  - `schemaVersion`
  - `name`
  - `source` metadata (original file name/hash, import timestamp)
  - blocks with `target`, `order`, `text`

### Preset library

- Store SillyClaw presets in a dedicated directory (not OpenClaw’s main config file).
- List/show presets by name/id.
- Export a SillyClaw preset back to JSON (SillyClaw format).

### Stacks

- Create/update/delete stacks.
- Add/remove/reorder layers in a stack.
- Support per-stack macro mapping values:
  - `char`
  - `user`
- Compilation rules must be deterministic and stable.

### Activation

- Select an active stack:
  - global default, and
  - session override (preferred) when feasible.
- Activation changes must take effect without requiring a gateway restart (where possible).

### Injection

- Use OpenClaw typed hook `before_prompt_build`.
- Emit only:
  - `prependSystemContext` and
  - `prependContext`
- Never override OpenClaw’s kernel system prompt in normal operation.

### Macro handling

- Detect `{{char}}` / `{{user}}` usage.
- If mapping missing:
  - do not substitute,
  - present a user-facing prompt to set mapping (commands/config guidance).

## Quality requirements

- Fail-safe behavior: bad preset import must not crash agent runs.
- Input validation: treat imported JSON as untrusted.
- Token awareness: provide character-count diagnostics for injected strings.
- Backward compatibility: version and migrate SillyClaw JSON formats.

## UX / surfaces (options)

Minimum viable control surface:

- Gateway commands such as:
  - list presets
  - import preset from file
  - manage stacks
  - activate stack
  - set macro mapping

Optional:

- Control UI config UI hints for:
  - default stack selection
  - preset library path
  - macro mapping defaults

## Phased roadmap

### Phase 1 — Skeleton + static injection

Deliverables:

- Plugin skeleton that registers `before_prompt_build`.
- A single “hardcoded” or minimally configured preset layer that injects:
  - `prependSystemContext` and/or `prependContext`
- Diagnostics: log active preset and injected sizes.

Exit criteria:

- OpenClaw runs normally, and SillyClaw injection is visible in behavior without breaking tool use.

### Phase 2 — SillyTavern import + SillyClaw preset JSON

Deliverables:

- Importer that reads SillyTavern preset JSON and converts to SillyClaw preset JSON.
- Preset library storage (directory + index).
- Commands to list/show imported presets.

Exit criteria:

- Import a known SillyTavern preset and reproduce its key prompt text segments in the compiled output.

### Phase 3 — Stacks + macro mapping

Deliverables:

- Stack model: create/update stacks, add/remove layers, reorder.
- Per-stack macro mapping (`char`, `user`).
- Rendering pipeline that compiles stacks deterministically.
- User guidance when mappings are missing.

Exit criteria:

- Operator can combine a base layer and a character layer and get stable compiled injection with correct substitution.

### Phase 4 — Hardening + diagnostics polish

Deliverables:

- Robust validation for imports and stored JSON.
- Migration framework for `schemaVersion`.
- Test suite for:
  - import parsing
  - compilation ordering
  - macro substitution edge cases
  - stack override semantics
- Better observability (active stack, layer list, sizes).

Exit criteria:

- No crashes on malformed inputs; deterministic behavior across restarts; tests cover critical paths.

### Future (explicitly deferred)

- `appendSystemContext` as a first-class target (once a clear semantic is chosen).
- Context-engine implementation for closer SillyTavern semantics (markers/in-chat injection).
- Rich UI for stack editing.

## Open questions (to resolve during Phase 2–3)

1. Should the SillyTavern “main prompt” be treated as part of `prependSystemContext` by default, or split into a separate target?
2. Should “after main but before chat history” blocks be system-space (likely) or dropped/flattened?
3. How should duplicates merge when stacking layers (replace vs concat), and which blocks should be “replace by default”?

