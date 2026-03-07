# Architecture Design (SillyClaw)

This document describes the intended architecture for SillyClaw: an OpenClaw plugin that imports SillyTavern presets and applies them as **role-playing prompt overlays** without replacing OpenClaw’s system prompt kernel.

## Goals (from clarified requirements)

1. Use **typed OpenClaw plugin hooks** (`before_prompt_build`) as the injection mechanism.
2. **Do not** implement context-engine / message-list manipulation in the near term.
3. **Import SillyTavern presets**, then convert them into SillyClaw’s own JSON format for management.
4. Support **preset stacks** (layering/overlays) as a first-class concept.
5. Preserve (optionally substitute) SillyTavern macros `{{char}}` and `{{user}}` only.
6. Keep OpenClaw’s kernel system prompt intact.

Non-goals are captured in the PRD.

## Integration points with OpenClaw

### Prompt injection hook (primary)

SillyClaw injects text via OpenClaw’s typed agent lifecycle hook:

- Hook: `before_prompt_build`
- Outputs used:
  - `prependSystemContext`: stable system-space prefix
  - `prependContext`: prepended to the user prompt (used to approximate “post-history instructions”)

Key constraint: SillyClaw does **not** use the `systemPrompt` override except for emergency debugging.

### Optional control surface (recommended)

SillyClaw should expose a minimal command surface so the operator can:

- import presets
- create/edit stacks
- select an active stack (global or per-session)
- set macro mappings for `{{char}}`/`{{user}}`

The exact UI surface can be:

- slash-style commands handled by the gateway (plugin commands), and/or
- Control UI configuration (JSON Schema + uiHints)

## Conceptual model

### 1) “Preset” is a reusable layer

A **preset layer** is a named collection of prompt blocks that can be applied to a stack.

Examples:

- “ST: Default OpenAI preset (imported)”
- “Character: Alice”
- “Style: Noir narration”
- “Safety overlay: No NSFW”

### 2) “Stack” is the active composition unit

A **stack** is an ordered list of preset layers plus optional overrides (like macro mappings).

The stack compiles to an injection payload:

- `prependSystemContext` (string)
- `prependContext` (string)
- (reserved) `appendSystemContext` (string)

### 3) “Compilation” is deterministic string assembly

At runtime, SillyClaw resolves the active stack, then compiles it into the two strings required by OpenClaw’s hook.

No message-list edits. No tool calls.

## Data flow

### Import flow (SillyTavern preset JSON → SillyClaw preset layer JSON)

1. **Parse** SillyTavern preset JSON.
2. **Extract** prompt definitions and the active prompt order (enabled/disabled).
3. **Normalize** into SillyClaw block primitives (targets + ordering).
4. **Persist** as SillyClaw JSON in the SillyClaw preset library.

### Runtime flow (OpenClaw run → injection)

1. OpenClaw starts an agent run and triggers `before_prompt_build`.
2. SillyClaw resolves:
   - active stack (global/per-session, depending on configuration),
   - macro mapping (`char`, `user`).
3. SillyClaw compiles the stack to:
   - `prependSystemContext`: “before main prompt” segment (+ other system-stable blocks)
   - `prependContext`: “after chat history” segment
4. OpenClaw applies:
   - `prependSystemContext` to the system prompt (without replacing the kernel),
   - `prependContext` in front of the user prompt for that run.

## SillyTavern import mapping (initial, conservative)

SillyTavern’s prompt manager conceptually builds a prompt with markers such as:

- `main` (main prompt)
- `chatHistory` (history marker)
- “post-history instructions” (often `jailbreak` / PHI)

SillyClaw maps SillyTavern prompts into two segments aligned with available OpenClaw hook fields:

### Segment A → `prependSystemContext`

- “The part before the main prompt” (per requirement).
- Practically, this includes any enabled blocks that appear before `main` in the SillyTavern order.

Implementation note: because OpenClaw does not provide “insert a system message between system prompt and history”, SillyClaw may also choose to include **the main prompt itself** in `prependSystemContext` by default, since it is system-stable and cache-friendly. If this causes conflicts, we can later introduce a per-import option:

- `mainTarget: "system.prepend" | "system.append" | "user.prepend"`

### Segment B → `prependContext`

- “The part after chat history” (per requirement).
- This is used to approximate SillyTavern’s “post-history instructions”: it lands *after* history (because it is prepended to the current user message).

### `appendSystemContext` (deferred)

No initial mapping is required. The architecture keeps the target available so we can introduce it later for:

- low-priority overlays, or
- large blocks that should appear after OpenClaw kernel sections.

## Internal JSON formats (SillyClaw-owned)

The exact schema is an implementation detail, but the architecture assumes:

### Preset layer file

- Versioned (`schemaVersion`)
- Source metadata (import provenance)
- A list of blocks with:
  - `target`: `system.prepend` | `system.append` | `user.prepend`
  - `order`: number (stable ordering within a target)
  - `text`: string (prompt content)
  - optional `enabled` and/or `blockKey` for override semantics

### Stack definition

- Versioned (`schemaVersion`)
- Ordered list of preset ids
- Optional `macroMapping`:
  - `char`: string
  - `user`: string

## Macro substitution

### Supported macros

- `{{char}}`
- `{{user}}`

### Resolution rules

1. If the compiled output contains either macro and the corresponding mapping is missing:
   - Do not substitute.
   - Emit a user-facing hint (via commands/config UX) to set mappings.
2. Otherwise, substitute in both `prependSystemContext` and `prependContext`.

### Safety note

Macro values must be treated as plain text (no special formatting or evaluation).

## Ordering and precedence (stacks)

SillyClaw must provide stable and explainable merging:

- Stack layers are applied in declared order (base → overlays).
- Blocks are grouped by `target`, then sorted by `order`, then concatenated with a consistent separator (e.g., `\n\n---\n\n` or simple blank lines).
- If two layers provide blocks with the same `blockKey`, SillyClaw should support a policy:
  - `replace` (later layer wins), or
  - `concat` (both included)

This is essential to make stacks manageable without surprising duplication.

## Observability and diagnostics

Minimum diagnostics to support:

- active stack id/name
- resolved macro mapping presence (not the values, unless explicitly requested)
- injected character counts for each target

Do not dump full prompt bodies by default (privacy + clutter).

