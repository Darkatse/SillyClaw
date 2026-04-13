# Data Formats V2

This document describes the active v2 storage, import, and planning model. It is intentionally separate from the superseded v1 formats documented in `docs/data-formats.md`.

## 1. Transitional Storage Root

To avoid colliding with the current v1 runtime, v2 data lives under:

```text
dataDir/
  v2/
    state.json
    indexes/
      layers.json
      stacks.json
    layers/
      <layerId>.json
    stacks/
      <stackId>.json
    artifacts/
      <artifactKey>.json
```

This keeps the v2 schema isolated from the superseded v1 on-disk model while Phase 2 cuts the runtime over to the planner-based path.

## 2. Design Principles

The v2 on-disk model preserves the source preset more faithfully than v1:

- prompt definitions are stored as `fragments`,
- every imported `prompt_order` list is preserved as a `scope`,
- one imported source file can therefore yield multiple stacks,
- markers are preserved as anchors instead of being discarded,
- unsupported SillyTavern macro syntax is imported as opaque text and summarized in diagnostics,
- supported request-time SillyTavern prompt regex rules are stored separately as layer-owned regex data.

## 3. Layer File

Path:

- `v2/layers/<layerId>.json`

Shape:

- `schemaVersion: 2`
- `id: string`
- `name: string`
- `source?: { kind: "sillytavern", fileName?, fileHashSha256?, importedAt }`
- `regexSource?: { kind: "sillytavern", fileName?, fileHashSha256?, importedAt }`
- `fragments: PromptFragmentV2[]`
- `scopes: PromptScopeV2[]`
- `regexRules: RegexRuleV2[]`
- `featureSummary: PromptFeatureFlagV2[]`
- `diagnostics: ImportDiagnosticV2[]`

### `PromptFragmentV2`

- `id`
- `sourceIdentifier`
- `name`
- `role: "system" | "user" | "assistant"`
- `contentTemplate`
- `marker: boolean`
- `systemPrompt: boolean`
- `anchorBinding?`
- `triggerPolicy: string[]`
- `insertion`
  - `{ kind: "relative" }`
  - `{ kind: "absolute", depth, order }`
- `forbidOverrides: boolean`
- `featureFlags`

### `anchorBinding`

Known source identifiers normalize to stable anchors:

- `main`
- `persona`
- `character.description`
- `character.personality`
- `character.scenario`
- `world-info.before`
- `world-info.after`
- `dialogue-examples`
- `chat-history`
- `unknown-marker`

OpenClaw source mapping for future planning:

- `persona` resolves from `USER.md`
- `character.*` resolves from `SOUL.md` + `IDENTITY.md`

### `PromptScopeV2`

A preserved `prompt_order` graph from the source preset.

- `id`
- `name`
- `sourceScope`
  - `{ kind: "flat-prompt-order" }`
  - `{ kind: "character-prompt-order", characterId }`
- `entries: PromptScopeEntryV2[]`
- `preferredRenderer: "hooks" | "hybrid" | "context-engine"`

### `PromptScopeEntryV2`

- `fragmentId`
- `enabled`
- `ordinal`

Important:

- disabled entries are preserved,
- entries that reference missing fragment definitions are dropped during import,
- the importer does not collapse multiple scopes into one preferred scope.

### `RegexRuleV2`

Layer-owned request-time regex rule storage.

- `id`
- `name`
- `findRegex`
- `replaceString`
- `placements`
  - `"user-input"`
  - `"ai-output"`
- `disabled`
- `minDepth?`
- `maxDepth?`

Important:

- rules are stored in execution order,
- `markdownOnly=true` always wins and the rule is skipped at import time,
- current import support is intentionally limited to `promptOnly=true`,
- unsupported placement, substitution, and trim modes are skipped instead of being normalized into a different behavior.

## 4. Stack File

Path:

- `v2/stacks/<stackId>.json`

Shape:

- `schemaVersion: 2`
- `id: string`
- `name: string`
- `layers: Array<{ layerId, scopeId }>`
- `preferredRenderer: "hooks" | "hybrid" | "context-engine"`
- `contentBindings?`

Current default `contentBindings`:

- `persona = USER.md`
- `character = ["SOUL.md", "IDENTITY.md"]`

Phase 1 importer creates one stack per imported scope:

- `layerId--default`
- `layerId--character-100000`
- `layerId--character-100001`

depending on the source preset shape.

## 5. State File

Path:

- `v2/state.json`

Shape:

- `schemaVersion: 2`
- `defaultStackId?: string`
- `stackByAgentId: Record<string, string>`
- `stackBySessionKey: Record<string, string>`

State is selection-only. Artifact pointers do not belong here.

## 6. Index Files

### `v2/indexes/layers.json`

Array of:

- `id`
- `name`
- `sourceKind?`
- `updatedAt`
- `fragmentCount`
- `scopeCount`
- `absoluteCount`
- `regexCount`
- `enabledRegexCount`
- `placementSummary`
- `hash`

### `v2/indexes/stacks.json`

Array of:

- `id`
- `name`
- `layerIds`
- `scopeIds`
- `updatedAt`
- `hash`
- `artifactKey?`
- `placementSummary?`
- `preferredRenderer`
- `diagnosticsSummary`

This is the cache authority for stack artifacts.

Important:

- `hash` is the structural digest of the stack file content,
- `artifactKey` is the currently valid compiled artifact for that stack,
- `placementSummary` is a cached count summary derived from the current artifact,
- active summary reads should prefer this index over stack-body hydration whenever possible.

### `placementSummary`

Shape:

- `hook`
  - `prependSystem`
  - `appendSystem`
  - `prependContext`
- `engine`
  - `beforeHistory`
  - `afterHistory`
  - `absolute`

Important:

- this summary is cache-backed rather than source-backed,
- it is written when an artifact is saved,
- it is cleared when the artifact pointer is invalidated,
- list commands use it so they can stay index-first.

## 7. Artifact Files

Path:

- `v2/artifacts/<artifactKey>.json`

Shape:

- `schemaVersion: 2`
- `key`
- `stackId`
- `plannerVersion`
- `rendererVersion`
- `createdAt`
- `hookArtifact?`
- `engineArtifact?`
- `regexArtifact?`
- `diagnosticsSummary`

### `hookArtifact`

Phase 2 stores the exact hook-renderable envelope:

- `injection`
  - `prependSystemContext?`
  - `appendSystemContext?`
  - `prependContext?`
- `entryKeys`
  - `prependSystem`
  - `appendSystem`
  - `prependContext`

### `engineArtifact`

Phase 3 compiles a message-level instruction artifact for the SillyClaw context engine.

Shape:

- `beforeHistory`
  - ordered message instructions
  - each item contains:
    - `entryKeys`
    - `role`
    - `content`
- `afterHistory`
  - ordered message instructions
  - each item contains:
    - `entryKeys`
    - `role`
    - `content`
- `absolute`
  - depth insertion instructions
  - each item contains:
    - `entryKeys`
    - `role`
    - `content`
    - `depth`
    - `order`

Important:

- `beforeHistory` and `afterHistory` are message-level approximations for any imported prompt that is not hook-exact but can still be expressed relative to transcript history,
- `absolute` mirrors SillyTavern in-chat insertion semantics and is applied against the live transcript only,
- anchor-relative prompts from the source graph are not reinterpreted as internal OpenClaw system-prompt anchors during runtime.

### `regexArtifact`

Compiled request-time regex artifact.

Shape:

- `rules`
  - ordered compiled regex rules
  - each item contains:
    - `key`
    - `stackId`
    - `layerId`
    - `ruleId`
    - `name`
    - `findRegex`
    - `replaceString`
    - `placements`
    - `minDepth?`
    - `maxDepth?`

Important:

- regex rules remain layer-owned in storage and stack-owned in compilation,
- compilation collects enabled regex rules by stack layer order,
- request-time execution rewrites transcript messages before `engineArtifact` insertions are assembled,
- only user and assistant history messages are rewritten in the current phase.

### `diagnosticsSummary`

This is a summary of both:

- import diagnostics,
- planner diagnostics.

The runtime uses this for stack inspection and warm-path observability without hydrating full layer bodies.

## 8. Render Plan

Planner output is not stored as a separate top-level file. It is materialized at compile time and partially persisted into the artifact.

Conceptual shape:

- `stackId`
- `preferredRenderer`
- `sequence`
  - ordered enabled scope entries with layer/scope provenance
  - marker and anchor metadata preserved
  - history-segment context preserved
- `hookEnvelope`
  - `prependSystem`
  - `appendSystem`
  - `prependContext`
- `engineInsertions`
  - ordered non-hook planner entries retained as the canonical remainder before renderers compile artifacts
- `diagnostics`

Important Phase 2 rule:

- `appendSystemContext` is not inferred from arbitrary SillyTavern anchor-relative data,
- it is only populated when the planner can justify whole-system-after semantics,
- most imported SillyTavern scopes therefore produce empty `appendSystemContext`.

Important Phase 3 rule:

- the context engine renderer consumes the compiled `engineArtifact`, not raw SillyTavern scopes and not hook strings,
- active stack selection in engine mode uses `sessionKey` first and `defaultStackId` second,
- hook rendering must use that same selection basis whenever SillyClaw is the active context engine.

Important Phase 4 rule:

- warm artifact lookup reads `state.json` for selection and `indexes/stacks.json` for cache identity,
- no artifact pointer is stored in state,
- `inspectActive` should reuse the artifact and stack index instead of recompiling the selected stack.

Important Phase 5 rule:

- cached placement summaries are derived from the artifact and persisted into the stack index,
- diagnostics commands may compile or reuse one target stack on demand,
- cache stats may inspect the artifact directory because they are explicit tooling rather than startup behavior.

## 9. Import Semantics

Importer:

- `src/v2/import/sillytavern.ts`

Supported source shapes:

- PromptManager-style flat `prompt_order`
- OpenAI preset `prompt_order` with multiple `character_id` lists

Current preservation rules:

- all prompt definitions become fragments,
- all `prompt_order` lists become preserved scopes,
- markers become anchor-bound fragments,
- advanced SillyTavern macro syntax inside prompt bodies is detected but not executed,
- supported request-time prompt regex rules are imported into `regexRules`,
- `markdownOnly` rules are always skipped,
- renderer preference is inferred per scope:
  - `context-engine` when enabled prompts contain absolute insertions or non-system roles
  - `hybrid` when the scope is system-only but still touches chat-history placement
  - `hooks` only for narrow system-only, hook-safe scopes

## 10. Current CLI Surface

Current commands:

- `openclaw sillyclaw import <file> [--with-regex]`
- `openclaw sillyclaw active`
- `openclaw sillyclaw state`
- `openclaw sillyclaw cache stats`
- `openclaw sillyclaw layers list`
- `openclaw sillyclaw layers show <layerId>`
- `openclaw sillyclaw layers scopes list <layerId>`
- `openclaw sillyclaw layers scopes show <layerId> <scopeId>`
- `openclaw sillyclaw layers scopes enable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes disable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes move <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers fragments list <layerId>`
- `openclaw sillyclaw layers fragments show <layerId> <fragmentId>`
- `openclaw sillyclaw layers fragments set-content <layerId> <fragmentId>`
- `openclaw sillyclaw layers fragments set-insertion <layerId> <fragmentId>`
- `openclaw sillyclaw layers regex list <layerId>`
- `openclaw sillyclaw layers regex show <layerId> <ruleId>`
- `openclaw sillyclaw layers regex import <layerId> <file>`
- `openclaw sillyclaw layers regex enable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex disable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex move <layerId> <ruleId>`
- `openclaw sillyclaw stacks list`
- `openclaw sillyclaw stacks show <stackId>`
- `openclaw sillyclaw stacks inspect <stackId>`
- `openclaw sillyclaw stacks diagnostics <stackId>`
- `openclaw sillyclaw stacks use <stackId>`

These commands operate on the v2 runtime and planner path.

Observability contract:

- `active` reports the resolved stack, cache source, hook injection sizes, and compiled placement summary,
- `layers scopes show` exposes one preserved `prompt_order` with fragment-aware entry metadata,
- `layers fragments show` prints one fragment body plus its scope references,
- `stacks list` stays index-backed and shows cached placement summaries when a current artifact exists,
- `stacks inspect` shows the compiled artifact summary plus safe entry-level placement metadata,
- `stacks diagnostics` shows import diagnostics and planner diagnostics without printing prompt bodies,
- `cache stats` reports cold, warm, stale, tracked, stored, and orphaned artifact counts.
