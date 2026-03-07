# Data formats (SillyClaw)

SillyClaw treats SillyTavern preset JSON as an **import source** and persists everything it needs in SillyClaw-owned, versioned JSON files under `dataDir`.

## On-disk layout

Under `dataDir` (from `plugins.entries.sillyclaw.config.dataDir`):

- `state.json`
- `presets/<presetLayerId>.json`
- `stacks/<stackId>.json`

## Versioning policy

- `schemaVersion` is required conceptually but **defaults to `1` when missing** on load.
- Any `schemaVersion` other than `1` currently throws.

Implementation: `src/schema.ts`.

## Preset layer (`presets/<id>.json`)

Shape (v1):

- `schemaVersion: 1`
- `id: string` (UUID by default)
- `name: string`
- `source?: { kind: "sillytavern" | "manual", ... }`
- `blocks: PresetBlock[]`

`PresetBlock` (v1):

- `target: "system.prepend" | "system.append" | "user.prepend"`
- `order: number` (sorted ascending within a layer)
- `text: string`
- `enabled?: boolean` (default enabled when omitted)
- `blockKey?: string` (import uses SillyTavern `identifier`)
- `merge?: "concat" | "replace"` (reserved; not used by the compiler yet)

Notes:

- `system.append` is parsed and can exist on disk, but **compilation throws** if an enabled block uses it (feature deferred).
- Whitespace-only `text` blocks are ignored during compilation.

## Preset stack (`stacks/<id>.json`)

Shape (v1):

- `schemaVersion: 1`
- `id: string`
- `name: string`
- `layers: string[]` (preset layer ids; stack order is base → overlays)
- `macros?: { char?: string, user?: string }`

Macro substitution:

- Only `{{char}}` and `{{user}}` are recognized.
- Missing mappings keep the placeholder intact and are reported as `missingMacros`.

## Runtime state (`state.json`)

Shape (v1):

- `schemaVersion: 1`
- `defaultStackId?: string`
- `stackByAgentId: Record<string, string>` (agentId → stackId)
- `stackBySessionKey: Record<string, string>` (sessionKey → stackId)

Resolution precedence:

1. `stackBySessionKey[sessionKey]`
2. `stackByAgentId[agentId]`
3. `defaultStackId`
4. none

Implementation: `src/runtime.ts` (`resolveActiveStackSelection`).

## SillyTavern import mapping (current)

Importer: `src/import/sillytavern.ts`.

Supported `prompt_order` shapes:

1. PromptManager export:
   - `prompt_order: Array<{ identifier: string, enabled: boolean }>`
2. OpenAI preset format:
   - `prompt_order: Array<{ character_id: number, order: Array<{ identifier, enabled }> }>`
   - preference: `character_id: 100001`, fallback: `100000`, else first list

Mapping rules:

- Marker prompts (`marker: true`) are skipped.
- Entries that reference missing prompt definitions are skipped.
- `main` (identifier `main`) is placed at:
  - `system.prepend` by default, or
  - `user.prepend` when specified at import time (`--main-target user.prepend`).
- Prompts after `chatHistory` map to `user.prepend`.
- Everything else maps to `system.prepend`.

“Main prompt not found” behavior:

- Import does not require `main`. If `main` is absent, prompts before `chatHistory` still map to `system.prepend`.

