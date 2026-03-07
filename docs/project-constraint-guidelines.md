# Project Constraint Guidelines (SillyClaw)

This document defines **constraints, invariants, and maintenance rules** for the SillyClaw project. It intentionally avoids prescribing a specific implementation; it exists to prevent architectural drift and “clever” changes that erode maintainability.

## North star

SillyClaw adds **role-playing prompt overlays** to OpenClaw while preserving OpenClaw’s core responsibilities (tool use, safety posture, gateway/session integrity, multi-channel operation).

## Hard constraints (must not change without an explicit design review)

### 1) Preserve OpenClaw’s system prompt kernel

- Do **not** replace OpenClaw’s system prompt (`systemPrompt` override) in normal operation.
- Only add text via **typed plugin hook** `before_prompt_build` using:
  - `prependSystemContext` (stable system-space prefix), and
  - `prependContext` (user-prompt prefix; used to approximate “post-history instructions”).
- `appendSystemContext` is reserved for future use; do not require it for correctness.

Rationale: the OpenClaw kernel prompt encodes tool contracts, safety, runtime semantics, and debugging affordances; overriding it creates a long-term merge burden and breaks upstream expectations.

### 2) No programmatic context assembly (for now)

- Do not implement a context engine (`plugins.slots.contextEngine`) for SillyClaw in initial releases.
- Do not modify the message list, ordering, compaction, or pruning behavior.

Rationale: context assembly is high-risk and multiplies failure modes across providers, tool-call integrity, and compaction retries.

### 3) Import SillyTavern presets, but only as an input format

- Treat SillyTavern preset JSON as an **import source**, not a runtime dependency.
- Do not embed SillyTavern code or replicate its full prompt-manager semantics.
- Import only the prompt text + prompt order information needed for SillyClaw’s injection model; ignore generation parameters (temperature/top_p/etc).

Rationale: SillyClaw’s goal is prompt injection compatibility, not feature parity.

### 4) Minimal injection surface

- Inject **text only** (no tool side effects, no “auto exec”, no file edits).
- Avoid any hook that mutates tool results, sessions, or outbound messages.
- When injection fails (bad preset, missing mapping), SillyClaw must degrade gracefully:
  - do not crash the agent run,
  - do not corrupt sessions,
  - emit a clear warning in logs and (optionally) a small user-visible hint.

### 5) Macros are strictly scoped

- Support only `{{char}}` and `{{user}}` macro substitution.
- Any other `{{...}}` tokens are passed through unchanged.
- If `{{char}}`/`{{user}}` appear but mappings are missing, SillyClaw must:
  - continue the run without substitution, and
  - prompt the operator to set the mapping (via SillyClaw commands/config).

Rationale: macro scope creep becomes an unbounded compatibility problem.

## Design invariants (what “good” looks like long-term)

### Determinism

- Given the same OpenClaw session state + the same active preset stack, SillyClaw injection must be deterministic.
- No background jobs, timers, or network calls are allowed as part of injection.

### Observable behavior

- Operators must be able to answer: “What preset stack is active, and what did it inject?”
- Provide lightweight diagnostics (e.g., “active stack id/name” and injected char counts) without dumping full prompt content by default.

### Upstream compatibility

- Keep SillyClaw’s coupling to OpenClaw limited to:
  - the plugin SDK API surface (typed hook registration),
  - plugin config schema + UI hints,
  - supported command registration (if used).
- Avoid relying on OpenClaw internal file paths or undocumented runtime behavior.

### Storage hygiene

- Do not store large prompt bodies in `~/.openclaw/openclaw.json`.
- Store SillyClaw-managed presets/stacks in a dedicated SillyClaw data directory (exact location is an implementation detail, but must be cross-platform and safe for backups).
- All SillyClaw JSON formats must be versioned (`schemaVersion`) and migratable.

### Testability

- Parsing/import and rendering/compilation must be unit-testable without a running gateway.
- Treat imported JSON as untrusted input; tests must cover malformed and adversarial cases (missing fields, huge strings, invalid types).

## Change control (how we evolve without rotting)

### Allowed changes (low risk)

- New preset JSON fields that are optional and backward compatible.
- Additional SillyTavern import variants if they map cleanly onto existing SillyClaw primitives.
- Better diagnostics, validation, and tooling around existing injection.

### Design-review-required changes (high risk)

- Introducing a context engine or message-list manipulation.
- Overriding OpenClaw’s system prompt kernel.
- Adding new macros beyond `{{char}}`/`{{user}}`.
- Introducing side-effecting automation (exec, write/edit, webhooks, background services).

### Deprecation policy

- Never silently change how an existing imported preset renders.
- If behavior must change, gate it behind a new `schemaVersion` or a per-preset compatibility mode and document it.

## Operational guidance (for contributors)

- Prefer small, composable primitives (parse → normalize → compile → inject).
- Keep injection logic pure (string-in/string-out) as much as possible.
- Keep “UI/commands” separate from “core compilation” logic so future UIs can be added without rewriting the engine.

