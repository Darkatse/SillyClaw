# SillyClaw V2 Refactoring Plan

This document replaces the original v1 mental model of "import SillyTavern JSON, flatten to two strings, inject with `before_prompt_build`". The new plan treats SillyTavern prompt placement as the primary product requirement and treats OpenClaw hook fields as only one of two execution backends.

## 1. Executive Summary

SillyClaw v1 is structurally too weak for the stated goal. It stores prompt blocks as coarse text buckets and renders them only through `prependSystemContext` and `prependContext`. That is simple, but it cannot faithfully represent:

- system prompt placement before and after other system prompt content,
- chat-history-relative prompt placement,
- in-chat insertion by depth,
- role-specific inserted prompts,
- relative prompt placement that depends on markers or anchors.

OpenClaw now provides a first-class context-engine slot. That changes the design space completely. The correct long-term architecture is:

1. import SillyTavern presets into a SillyClaw-owned canonical prompt model,
2. preserve every prompt-order scope from the source instead of collapsing to one preferred order,
3. plan prompt placement once from that canonical model,
4. render only lossless, system-only, cache-friendly envelope content through hook fields,
5. render mixed-role, history-relative, and depth-relative content through a SillyClaw context engine,
6. treat advanced SillyTavern macro and regex syntax as opaque imported text unless a future compatibility layer is explicitly added,
7. keep startup and first-screen load fast by making the plugin index-first and lazily hydrated.

The resulting design is more ambitious than v1, but it is also cleaner. It stops pretending that all SillyTavern semantics are string prefixes and instead models placement explicitly.

## 2. Scope and Assumptions

This plan assumes "initial screen-load process" means the earliest user-visible load path for this plugin:

- OpenClaw plugin registration and gateway startup,
- first control-surface load for viewing SillyClaw presets and stacks,
- first active-stack resolution for a real run.

This document does not optimize browser paint or CSS layout because the current project has no dedicated UI implementation yet. The optimization target is the plugin's data access, compilation, and initialization path.

## 3. Raw Requirements

From the current direction, the real requirements are:

1. Preserve SillyTavern preset placement semantics as far as OpenClaw allows.
2. Preserve every SillyTavern `prompt_order` scope that appears in the import source. Do not silently prefer one scope and discard the others.
3. Support the following placement classes as first-class concepts:
   - before system prompt content,
   - after system prompt content,
   - before chat history,
   - after chat history,
   - in-chat insertion by depth,
   - relative placement around anchors where possible.
4. Preserve OpenClaw's kernel system prompt rather than replacing it.
5. Remain compatible with OpenClaw's current plugin system.
6. Prefer bold refactoring over incremental compatibility hacks.
7. Keep startup, first inspection, and first run fast.
8. Favor maintainability over cleverness and over backward compatibility with the current SillyClaw schema.
9. Do not emulate SillyTavern's advanced macros or regex runtimes in phase 1. Import them as plain text and surface diagnostics instead.

## 4. First-Principles Conclusions

### 4.1 Prompt intent must be separated from render target

SillyTavern presets describe prompt intent. OpenClaw hook fields and the context engine are execution mechanisms. If we store prompt intent directly as hook-target strings, the storage model becomes a frozen record of one backend's limitations.

That is the core design flaw in v1.

### 4.2 There are two different execution planes

OpenClaw exposes two materially different prompt-mutation planes:

- Hook plane:
  - `prependSystemContext`
  - `appendSystemContext`
  - `prependContext`
- Context-engine plane:
  - ordered message assembly,
  - synthetic message insertion,
  - history-relative placement,
  - depth-aware placement,
  - optional `systemPromptAddition`

The hook plane is ideal for static system-adjacent content. The context-engine plane is required for history-relative and depth-relative behavior.

### 4.3 Startup cost should be near-constant

The plugin should not scan, parse, hydrate, or compile the full preset library during registration or initial view load.

That means:

- metadata indexes must exist,
- prompt bodies must load lazily,
- compiled artifacts must be cached,
- active-stack compilation must be isolated to the selected stack only.

### 4.4 Imported presets are scope graphs, not single prompt lists

The sample preset in `reference` makes this explicit:

- one source file can contain many prompt definitions,
- one source file can contain multiple `prompt_order` scopes keyed by `character_id`,
- the same prompt identifier can appear at materially different effective positions across scopes,
- markers are not disposable noise; they are anchors that define the graph.

Therefore the importer must preserve all source scopes. Picking `100001` and discarding `100000` is a lossy import strategy and is no longer acceptable in v2.

### 4.5 Complex presets are usually context-engine-first

The sample preset also shows that "static" does not imply "hook-safe".

If a segment mixes:

- `system` and `user`,
- `system` and `assistant`,
- relative markers and absolute depth insertions,

then hook rendering is already semantically lossy even if the text itself is static.

The context engine is therefore the default execution plane for complex imported scopes. Hooks are a narrow optimization, not the center of the design.

### 4.6 Unsupported SillyTavern runtime features should stay opaque

The project does not need to emulate SillyTavern's advanced macro or regex engines in v2 phase 1.

That means:

- import the content exactly,
- detect and annotate advanced syntax,
- do not execute or reinterpret it,
- do not distort the core model just to preserve extension-specific behavior.

### 4.7 A clean break is cheaper than preserving a broken schema

Because this is experimental, schema v2 should be designed correctly instead of carrying forward v1's lossy model. If needed, old data can be rejected or handled by a one-shot importer. The runtime should not pay permanent complexity for temporary compatibility.

## 5. Goals

### Functional goals

- Full support for the SillyTavern placement concepts that matter most:
  - system before,
  - system after,
  - history before,
  - history after,
  - absolute insertion by depth,
  - role-aware inserted prompts,
  - relative placement around known anchors when resolvable.
- Preserve all imported source scopes so a single SillyTavern file can yield multiple selectable stack variants.
- Prioritize the context engine for any scope whose enabled prompt sequence cannot be represented losslessly in the hook plane.
- Hook-only degraded mode when SillyClaw is enabled but not selected as the active context engine.
- Hybrid full-fidelity mode when `plugins.slots.contextEngine = "sillyclaw"`.
- Deterministic compilation and diagnostics.

### Non-functional goals

- Zero preset-body reads at plugin registration time.
- Index-only preset and stack listing.
- Warm-path first run without layer-body hydration when compiled artifacts are current.
- Strict module boundaries so render logic, storage, importing, and runtime orchestration do not leak into each other.
- Explicit source-feature reporting when imported content contains unsupported SillyTavern macro or regex syntax.

## 6. Non-Goals

- Full SillyTavern generation-parameter parity in the first refactor.
- Full SillyTavern macro parity in the first refactor.
- SillyTavern regex/runtime emulation in the first refactor.
- Compatibility with every historical SillyClaw on-disk format.
- Coexistence with another active context engine in full-fidelity mode.

## 7. Proposed Architecture

### 7.1 High-level shape

SillyClaw v2 should be organized into five layers:

1. Source adapters
   - parse SillyTavern export formats,
   - validate input,
   - normalize into SillyClaw v2 schema.
2. Canonical prompt model
   - represent prompt meaning and placement independently of OpenClaw.
3. Placement planner
   - resolve anchors, role, triggers, stack layering, and fallback rules into a concrete render plan.
4. Renderers
   - hook renderer,
   - context-engine renderer.
5. Persistence and runtime
   - indexes,
   - compiled artifact cache,
   - active selection resolution,
   - CLI and future UI support.

### 7.2 Canonical prompt model

The core abstraction should be a prompt graph with explicit source scopes, not a flat bucket list and not a single chosen prompt order.

Recommended v2 entities:

### `PromptFragment`

A single imported prompt definition.

Suggested fields:

- `id`
- `sourceIdentifier`
- `name`
- `contentTemplate`
- `role`: `system | user | assistant`
- `marker`
- `systemPrompt`
- `anchorBinding`
- `triggerPolicy`
- `insertion`
  - `relative`
  - `absolute`
    - `depth`
    - `order`
- `forbidOverrides`
- `featureFlags`

Important correction from the sample preset:

- placement does not live only on the fragment,
- effective relative placement also depends on the source scope order,
- the same prompt definition can participate in more than one scope.

### `PromptScope`

A preserved `prompt_order` graph from the import source.

Suggested fields:

- `id`
- `name`
- `sourceScope`
  - `kind`
  - `characterId?`
- `entries`
- `preferredRenderer`

### `ScopeEntry`

A single ordered reference inside a source scope.

Suggested fields:

- `fragmentId`
- `enabled`
- `ordinal`

### `AnchorBinding`

Known source markers should normalize to stable anchors.

Suggested values:

- `persona`
- `character.description`
- `character.personality`
- `character.scenario`
- `world-info.before`
- `world-info.after`
- `dialogue-examples`
- `chat-history`
- `main`

### `PresetLayerV2`

An importable layer containing:

- prompt fragments,
- preserved source scopes,
- source metadata,
- feature summaries,
- import diagnostics.

### `StackV2`

An ordered composition of selected layer scopes plus overrides:

- `layers`
  - `layerId`
  - `scopeId`
- optional content bindings,
  - `persona = USER.md`
  - `character = SOUL.md + IDENTITY.md`
- optional render policy,
- optional diagnostics policy.

### 7.3 Placement planner

The planner is the heart of the system. Both renderers must consume the same planner output.

Planner responsibilities:

1. resolve active stack,
2. resolve the selected scope for each layer,
3. apply overrides and conflict policy,
4. resolve triggers for the current run type,
5. resolve anchor bindings to concrete OpenClaw content sources,
6. classify fragments into:
   - hook-safe envelope content,
   - context-engine-required insertions,
   - degraded fallback renderings,
7. emit diagnostics for anything that cannot be represented exactly.

The planner output should be a `RenderPlan`, not raw strings.

Phase 2 should make one additional design choice explicit:

- the planner must be conservative.

If a fragment cannot be placed exactly with the current renderer, it must remain explicit in the plan as:

- engine-required, or
- degraded with a named diagnostic.

It must not be silently folded into the nearest string bucket.

Suggested shape:

- `hookEnvelope`
  - `prependSystem`
  - `appendSystem`
  - `prependUserPrompt`
- `engineInsertions`
  - ordered synthetic messages,
  - anchor/depth metadata,
  - role
  - before-history segments
  - after-history segments
- `diagnostics`
  - degradations,
  - unresolved anchors,
  - unsupported source syntax,
  - unsupported source fields

### 7.3.1 Exact Hook Windows

For Phase 2, the hook renderer should only claim exactness for windows that OpenClaw actually exposes:

1. `system.before`
   - a leading run of relative `system` fragments before any anchor, absolute insertion, or non-system fragment.
2. `system.after`
   - the whole-system append slot exposed by `appendSystemContext`.
   - this slot is exact only for fragments that are truly "after the entire OpenClaw system prompt", not merely after a SillyTavern anchor inside the source graph.
   - imported SillyTavern scopes usually do not provide enough information to prove this, because their markers are relative to internal prompt anchors while OpenClaw exposes only one outer system boundary.
3. `history.after`
   - a contiguous run of relative `system` fragments immediately after `chat-history` and before any other significant boundary.

Everything else must remain outside the exact hook envelope.

This is intentionally conservative. It preserves maintainability and avoids teaching the planner false semantics that Phase 3 would later have to undo.

### 7.3.2 Native vs Unsupported Anchors

For Phase 2 hook planning, distinguish between:

- native OpenClaw content bindings
  - `persona`
  - `character.description`
  - `character.personality`
  - `character.scenario`
- unsupported hook-only anchors
  - `world-info.before`
  - `world-info.after`
  - `dialogue-examples`
  - `unknown-marker`

Important correction:

- native content bindings are planner concepts, not hook-addressable sub-slots,
- OpenClaw's hook plane exposes only one outer system boundary,
- therefore imported fragments that are merely "after persona" or "after scenario" are still anchor-relative and must remain outside the exact hook envelope unless a future context-engine renderer places them.

Unsupported anchors must remain explicit planner boundaries. They may prevent a fragment from being claimed as exact in the hook plane.

### 7.4 Hook renderer

The hook renderer should be intentionally narrow.

It should render only content that is both:

- semantically safe to place in the hook plane,
- beneficial to keep near the system prompt for provider caching.

In practice this means:

- system-only,
- no absolute depth insertion,
- no required interleaving with `user` or `assistant` messages,
- no dependence on unresolved history-relative anchors,
- no inferred placement inside OpenClaw's internal system prompt structure.

Recommended mapping:

- `system.before` -> `prependSystemContext`
- `system.after` -> `appendSystemContext` only when the planner can prove whole-system-after semantics
- hook fallback for `history.after` only when the context engine is unavailable -> `prependContext`

The hook renderer should never try to emulate true depth insertion. If it degrades, it must say so in diagnostics.

Phase 2 implementation rule:

- the hook renderer should be the default runtime path for v2,
- but it should be willing to render nothing if the plan has no exact hook envelope.
- imported SillyTavern scopes should normally produce `prependSystemContext` and, when exact, `prependContext`.
- `appendSystemContext` remains available but should stay empty unless the planner can justify it without inventing internal system-anchor semantics.

An empty hook result with explicit diagnostics is correct. A non-empty but semantically fabricated hook result is not.

### 7.5 Context-engine renderer

The context-engine renderer exists to provide the fidelity that hooks cannot.

For complex imported scopes, it is the primary renderer rather than a secondary escape hatch.

It should:

- assemble the active message list,
- insert synthetic messages before history, after history, or at specific depth,
- preserve role for inserted prompts,
- support relative placements once they have been reduced to message-level placement,
- optionally emit a small `systemPromptAddition` only when the engine itself needs runtime-specific guidance.

It should also be able to absorb the entire prompt sequence for a scope when the planner determines that splitting across hooks and engine would be lossy.

Recommended ownership model:

- `ownsCompaction: false`
- `compact()` delegates to OpenClaw runtime

This gives SillyClaw message-placement power without taking on compaction debt in v2 phase 1.

Phase 3 implementation rule:

- the context engine must stay stateless with respect to prompt planning,
- it consumes the compiled engine artifact for the active stack,
- it reorders only the transcript message array passed to `assemble()`,
- it does not attempt to reinterpret raw SillyTavern JSON at runtime.

Important constraint from OpenClaw's contract:

- `assemble()` can replace transcript messages and optionally prepend one `systemPromptAddition`,
- it cannot address internal anchors inside OpenClaw's kernel system prompt,
- therefore Phase 3 can make history-relative and depth-relative placement exact,
- but imported prompts that were originally relative to `persona`, `scenario`, or other internal system-region anchors can only become best-available pre-history or post-history messages unless they already fit the exact hook envelope.

That is not a bug in the renderer. It is the actual boundary of the upstream context-engine slot.

### 7.5.1 Engine Artifact Contract

The context-engine renderer should not receive raw `engineInsertions` from the planner at runtime.

Phase 3 should compile a narrow engine artifact containing three buckets:

- `beforeHistory`
  - ordered message instructions rendered before the live transcript
- `afterHistory`
  - ordered message instructions rendered after the live transcript
- `absolute`
  - depth instructions rendered into the live transcript itself

The compile step should preserve provenance:

- each instruction records the contributing planner entry keys,
- each instruction records the rendered role and content,
- absolute instructions also record `depth` and `order`.

This keeps runtime assembly cheap and keeps the planner as the only place that understands prompt-graph semantics.

### 7.5.2 Absolute Depth Semantics

Depth semantics must follow SillyTavern's own in-chat insertion behavior rather than an approximate reinterpretation.

Phase 3 should therefore mirror these rules:

- absolute insertion targets the chat-history message list, not the hook envelope,
- depth `0` means "after the newest history message",
- increasing depth moves the insertion point further toward older history,
- prompts at the same depth are grouped by `order` and `role`,
- role grouping and order precedence should match SillyTavern's implementation and be locked by tests, not by memory.

### 7.5.3 Selection Contract In Engine Mode

The OpenClaw context-engine interface provides `sessionKey` during `assemble()`, but not `agentId`.

That has one direct implication:

- engine-mode active-stack resolution must use `sessionKey` first and `defaultStackId` second,
- agent-only overrides cannot be a primary selection primitive for Phase 3 engine assembly,
- hook rendering must use the same selection basis whenever SillyClaw is the active context engine, otherwise hook and engine artifacts could be compiled from different stacks.

### 7.6 Hybrid execution model

The same plugin should register both:

- a `before_prompt_build` hook,
- a context engine factory.

Behavior:

- If SillyClaw is enabled but not selected in `plugins.slots.contextEngine`, the plugin runs in degraded hook-only mode.
- If SillyClaw is selected as the active context engine, both renderers participate:
  - hook-safe system envelope content through hooks,
  - everything else through the context engine.
- in active engine mode, stack selection must be keyed by `sessionKey` or default selection so both renderers compile the same stack.

This keeps the model unified while making the fidelity level explicit.

Important implication from the sample preset:

- some imported scopes will be effectively context-engine-only in full-fidelity mode,
- the hook plan for those scopes may legitimately be empty.

### 7.8 Phase 2 Runtime Cutover

Because backward compatibility with v1 is not a project requirement, Phase 2 should treat the v2 runtime as the primary runtime:

- v2 state becomes the active selection source,
- v2 stacks become the active composition unit,
- the plugin's `before_prompt_build` hook should compile from the v2 planner and hook renderer,
- v1 compile/store/runtime code should be removed once the v2 path is complete enough to replace it.

This avoids running two storage and compilation systems in parallel.

### 7.7 OpenClaw Content Mapping

For v2 planning purposes, use the following OpenClaw content contracts:

- `USER.md` is the persona source,
- `SOUL.md` and `IDENTITY.md` together constitute the character source.

The planner should therefore treat:

- `personaDescription` as a persona anchor,
- `charDescription`, `charPersonality`, and `scenario` as character anchors backed by OpenClaw character content.

## 8. Initial Screen-Load and Startup Optimization Plan

This is the major structural optimization area.

### 8.1 Design rule: no full-library hydration on boot

Plugin registration must do only:

- config resolution,
- runtime object construction,
- hook registration,
- CLI registration,
- context-engine registration.

It must not:

- list all presets,
- parse all stack files,
- load prompt bodies,
- compile any stack artifact.

### 8.2 Index-first storage

The current store loads whole JSON bodies for list operations. That is acceptable for tiny libraries and unacceptable for a real control surface.

V2 should introduce metadata indexes:

Suggested layout:

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
      <stackArtifactKey>.json
```

### `indexes/layers.json`

Contains only lightweight metadata:

- `id`
- `name`
- `source kind`
- `updatedAt`
- `fragmentCount`
- `scopeCount`
- `absoluteCount`
- `placementSummary`
- `hash`

### `indexes/stacks.json`

Contains:

- `id`
- `name`
- `layerIds`
- `scopeIds`
- `updatedAt`
- `hash`
- `artifactKey`
- `preferredRenderer`
- `diagnosticsSummary`

This index is the cache authority for stack artifacts and the intended read path for control-surface summaries.

### 8.3 Lazy hydration

Hydrate full objects only on demand:

- preset body only when inspecting or editing a preset,
- stack body only when inspecting or activating a stack,
- fragment content only when compiling or editing.

This produces the correct cost model:

- list is cheap,
- inspect is moderate,
- compile is limited to the active stack.

### 8.4 Compiled artifact cache

Compiling a stack should not require reparsing and replanning on every run.

V2 should cache two artifacts per stack content hash:

- `hook artifact`
- `engine artifact`

Suggested artifact key inputs:

- stack hash,
- referenced layer hashes,
- renderer version,
- placement-planner version,
- macro-environment signature shape

Important rule:

- cache rendered structure, not only final strings.

For example:

- resolved ordered hook fragments,
- resolved engine insertion instructions,
- macro placeholders retained where safe,
- diagnostics summary.

Then the runtime can do a cheap final render pass for macro substitution instead of a full compile.

Phase 4 design correction:

- cache authority should live in one place only,
- `state.json` should not duplicate artifact pointers that already exist in the stack index,
- `indexes/stacks.json` should be the only authority for:
  - the current artifact key,
  - the stack hash used to identify the compiled input shape,
  - the last diagnostics summary emitted for that stack.

This removes one class of drift bugs and cuts one read from the warm path.

### 8.5 Warm-path active stack pointer

State resolution should not require scanning stacks.

`state.json` should point directly to:

- selected stack id per scope.

This enables a warm path where the runtime does:

1. read `state.json`,
2. read `indexes/stacks.json`,
3. read the current artifact.

That should be sufficient for most runs.

Phase 4 runtime rule:

- `inspectActive` and similar control-surface summary paths should use only state, stack index, and artifact data when an artifact is current,
- they should not hydrate stack or layer bodies just to report stack name, renderer preference, diagnostics, or injection sizes.

### 8.6 Invalidation strategy

Cache invalidation should be explicit and narrow:

- importing or editing a layer invalidates only stacks that reference that layer,
- editing a stack invalidates only that stack,
- changing planner or renderer version invalidates all artifacts,
- changing macro values should not force full recompilation if the artifact retains placeholders.

Phase 4 implementation rule:

- invalidation clears the stack index artifact pointer only,
- no artifact pointer should be stored in state,
- stack indexes should retain their structural hash even when the artifact pointer is cleared.

### 8.7 Feasibility and ROI

This optimization is highly feasible and high ROI.

Why:

- the plugin already stores state, layers, and stacks separately,
- the missing pieces are indexes and artifacts,
- the current data size is small enough to refactor without migration gymnastics,
- future UI work will need this anyway,
- using a transitional `dataDir/v2` root keeps the new architecture clean without forcing a half-finished runtime migration.

## 9. SillyTavern Compatibility Strategy

### 9.1 What we should preserve exactly

The following should be treated as compatibility-critical:

- prompt ordering,
- scope preservation across all imported `prompt_order` lists,
- markers and anchor meaning,
- role for inserted prompts,
- absolute depth insertion semantics,
- before-history and after-history semantics,
- before-system and after-system semantics,
- per-prompt enablement,
- prompt-level override rules where meaningful.

### 9.2 What we should preserve approximately only when necessary

- "after chat history" in hook-only mode
- relative anchor placements that depend on anchors not expressible without the context engine

Approximation is acceptable only when:

- the context engine is inactive, and
- diagnostics clearly report the downgrade.

### 9.3 What we should not over-commit to in phase 1

- every SillyTavern macro,
- regex/runtime behavior embedded in prompt content,
- every extension-defined prompt source,
- provider-specific generation controls,
- obscure edge cases whose exact semantics cannot be verified from fixtures.

These are valid future work items, not reasons to distort the v2 core.

## 10. Constraints

The design must preserve these constraints:

1. Never replace OpenClaw's kernel system prompt in normal operation.
2. Keep injection deterministic.
3. Avoid background compilation or discovery work during active prompt assembly.
4. Keep render logic pure where possible.
5. Avoid silent semantic loss.
6. Stay within OpenClaw's documented plugin interfaces.
7. Keep full-fidelity mode self-contained to the SillyClaw context engine slot.
8. Do not silently drop imported source scopes.
9. Do not reinterpret unsupported SillyTavern syntax as if it were native OpenClaw behavior.

## 11. Module Boundary Proposal

Suggested source layout:

```text
src/
  v2/
    api/
      commands.ts
      diagnostics.ts
    import/
      sillytavern.ts
    model/
      fragment.ts
      placement.ts
      layer.ts
      stack.ts
    plan/
      planner.ts
      anchors.ts
      merge.ts
      diagnostics.ts
    render/
      hooks.ts
      context-engine.ts
      macros.ts
    runtime/
      active-stack.ts
      engine.ts
      hook-entry.ts
      cache.ts
    store/
      indexes.ts
      layers.ts
      stacks.ts
      artifacts.ts
      state.ts
```

This layout intentionally separates:

- schema/model,
- planning,
- rendering,
- persistence,
- runtime entrypoints.

That separation is the main maintainability win.

## 12. Alternative Options Considered

### 12.1 Continue evolving v1 buckets

Pros:

- minimal immediate change

Cons:

- still lossy,
- still mixes storage with one backend's limitations,
- still poor fit for depth semantics,
- high future rewrite cost

ROI: poor

### 12.2 Full context-engine-only rewrite

Pros:

- maximum fidelity

Cons:

- throws away useful hook-plane caching,
- overuses the context engine for static content,
- creates unnecessary complexity for system-adjacent prompts

ROI: moderate, but worse than hybrid

### 12.3 Hybrid dual-renderer with canonical prompt graph

Pros:

- best semantic fit,
- cleanest long-term model,
- graceful degraded mode,
- excellent startup/load optimization opportunities

Cons:

- more moving parts than v1,
- requires disciplined planner design,
- exclusive-slot limitation for full-fidelity mode

ROI: best overall

## 13. Roadmap

### Phase 0: Freeze the new contract

- approve this v2 design
- define scope of placement fidelity for phase 1
- define the exact fallback policy for hook-only mode

Exit criteria:

- placement taxonomy and degraded-mode rules are documented

### Phase 1: Build the canonical model and storage

- add schema v2
- implement new layer model with preserved prompt fragments and source scopes
- implement new stack model that selects layer scopes explicitly
- add indexes
- add artifact storage
- add one-shot importer from SillyTavern JSON into v2
- preserve all imported `prompt_order` scopes instead of preferring a single one
- record unsupported macro/regex syntax as diagnostics only

Exit criteria:

- presets import into v2 without flattening to v1 targets
- imports preserve all source scopes
- list operations use indexes only

### Phase 2: Build the planner and hook renderer

- implement stack merge logic
- implement placement planner
- implement hook artifact generation
- implement degraded diagnostics
- cut the plugin runtime over to the v2 planner/hook-renderer path
- remove the superseded v1 compile/runtime pipeline

Exit criteria:

- hook-only mode works against v2 data
- system.before and system.after are exact
- degraded placements are reported, not hidden
- the plugin no longer depends on the v1 storage/compiler path

### Phase 3: Build the context-engine renderer

- register SillyClaw context engine
- implement insertion before history, after history, and by depth
- compile engine artifacts instead of reusing raw planner entries at runtime
- mirror SillyTavern absolute-depth ordering rules in the engine renderer
- switch hook selection to session/default resolution when SillyClaw is the active context engine
- delegate compaction to runtime
- ensure no duplication with hook output

Exit criteria:

- hybrid mode produces exact placement for supported fixture cases
- history-relative and depth-relative insertion are validated by tests
- engine-mode hook selection and engine selection always resolve the same stack

### Phase 4: Cache hardening and startup optimization

- artifact invalidation
- warm-path stack activation
- read-path minimization
- remove duplicate cache pointers from state
- make stack index the single cache authority
- make active summary paths index/artifact-only when warm
- CLI and diagnostic polish

Exit criteria:

- registration path performs no preset-body hydration
- warm first run reads only state/header/artifact paths
- `inspectActive` hydrates no stack or layer body files when a current artifact exists

### Phase 5: Tooling and observability

- add diagnostics command for render plan inspection
- add cache stats
- add placement summaries to list and inspect commands

Phase 5 implementation rule:

- observability should stay index-first on the common path,
- cached placement summaries belong in `indexes/stacks.json`, not in `state.json`,
- stack listing and warm active inspection should reuse index and artifact data instead of hydrating layer or stack bodies,
- detailed diagnostics may compile or reuse one target stack on demand, because that is an explicit inspection path rather than a startup path,
- cache stats may walk the artifact directory because they are an operator command, not part of prompt assembly.

Exit criteria:

- operators can explain what SillyClaw will inject and why
- stack list output exposes cached placement summaries whenever a current artifact exists
- diagnostics output exposes both import diagnostics and planner diagnostics without dumping prompt bodies
- cache stats distinguish cold, warm, stale, and orphaned artifact state

## 14. Acceptance Criteria

### Correctness

- Imported SillyTavern presets preserve placement metadata required for:
  - before system,
  - after system,
  - before history,
  - after history,
  - absolute depth insertion,
  - role-aware inserted prompts.
- Imported SillyTavern presets preserve all source `prompt_order` scopes.
- Hybrid mode reproduces expected message order for golden fixtures.
- Hook-only mode emits degradations for placements that cannot be represented exactly.
- Phase 2 hook planning never claims an anchor-relative imported fragment is exact merely because OpenClaw exposes `appendSystemContext`.
- Phase 3 engine assembly mirrors SillyTavern absolute depth behavior for supported fixture cases.
- When SillyClaw is the active context engine, hook and engine assembly resolve the same active stack.
- Phase 5 observability reports the compiled hook and engine placement summary for a warm stack without re-planning it.

### Load-path performance

- Plugin registration reads no layer or stack body files.
- Listing presets and stacks reads only metadata indexes.
- Opening a preset or stack detail view hydrates only the requested body.
- Cold first run compiles only the active stack.
- Warm first run reuses the active stack artifact without loading unrelated layers.
- Warm active-summary inspection reads only state, stack index, and artifact files.
- Stack list remains index-backed even after Phase 5 placement-summary output is added.

### Maintainability

- No renderer directly reads raw SillyTavern JSON.
- Hook and context-engine outputs are both derived from the same planner.
- Storage, planning, rendering, and runtime orchestration live in separate modules.
- Unsupported semantics are explicit in diagnostics.

## 15. Test Strategy

The v2 refactor should be test-first in the following areas:

### Golden compatibility fixtures

Create fixture presets and transcripts that cover:

- main before history
- jailbreak after history
- system-before/system-after
- multiple `prompt_order` scopes from one source file
- depth 0, 1, 2 insertions
- mixed roles at the same depth
- relative placements around anchors

The goal is to compare SillyClaw's planned output to the expected semantic order, not only to string snapshots.

### Planner tests

- merge order
- anchor resolution
- degraded fallback routing
- duplicate and override policy

### Renderer tests

- hook envelope output
- context-engine insertion ordering
- macro substitution behavior
- no duplicate placement across renderers

### Storage and cache tests

- index-only list behavior
- artifact invalidation
- warm-path reuse
- index-only active inspection
- selective invalidation after layer edits

### Observability tests

- stack diagnostics output
- cache stats classification
- cached placement summaries after compilation

## 16. Risks

### Context-engine exclusivity

Only one context engine can be active. Full-fidelity SillyClaw mode therefore competes with other context-engine plugins.

Mitigation:

- keep degraded hook-only mode available,
- document that full placement fidelity requires selecting SillyClaw in `plugins.slots.contextEngine`.

### Depth semantics are easy to get subtly wrong

SillyTavern's insertion orientation is non-trivial and should not be reimplemented from memory.

Mitigation:

- lock behavior with fixture-based tests derived from SillyTavern examples,
- define the semantic contract in tests before finalizing renderer code.

### Cache invalidation bugs

Incorrect artifact reuse can cause stale prompt output.

Mitigation:

- version artifacts aggressively,
- tie artifacts to stack and layer hashes,
- keep invalidation narrow and explicit.

## 17. Recommendation

Proceed with the v2 rewrite as a clean-break architecture:

- canonical prompt graph,
- shared placement planner,
- hook renderer for static envelope content,
- context-engine renderer for history- and depth-aware insertion,
- index-first storage and compiled artifacts for fast startup and first load.

This is the highest-ROI path because it solves the two hardest problems at once:

- semantic fidelity to SillyTavern placement,
- fast startup and first-screen load without turning the plugin into a filesystem-heavy runtime.

## 18. Current Status

Phases 1 through 5 are now implemented:

- v2 import preserves all source scopes,
- the planner and hook renderer are conservative and exact,
- the context engine owns history-relative and absolute depth placement,
- cache authority lives in the stack index,
- tooling exposes placement summaries, diagnostics, and cache stats.

Remaining work is now optional product refinement rather than architectural catch-up:

1. richer control-surface UI on top of the existing runtime and index model
2. optional artifact cleanup policy for untracked files
3. optional future compatibility work for selected SillyTavern runtime features

## 19. Phase 2 Design Decision

After reviewing OpenClaw's current prompt assembly again, one correction is now fixed for implementation:

- `prependSystemContext` and `appendSystemContext` wrap the entire OpenClaw system prompt,
- they do not expose stable insertion points inside `USER.md`, `SOUL.md`, or `IDENTITY.md`,
- therefore imported SillyTavern anchor-relative placements must not be projected onto those hook fields as if they were exact.

This means the Phase 2 planner will do the following:

- exact hook rendering for a leading system envelope before the kernel system prompt,
- exact hook rendering for a post-history system run only when it is contiguous and uncontaminated by depth or mixed-role boundaries,
- preserve a typed `engineInsertions` plan for everything else,
- keep `appendSystemContext` available but usually empty for imported SillyTavern scopes.

## 20. Phase 5 Design Decision

After reviewing the completed runtime, one Phase 5 correction is now fixed for the long term:

- placement observability is a cache concern before it is a planner concern,
- list and active-summary commands should not re-plan stacks that already have a current artifact,
- the stack index should therefore cache a placement summary derived from the artifact,
- on-demand diagnostics remain free to compile one stack because they are explicit operator inspection paths,
- the complex reference preset in `reference` is the acceptance fixture for proving that mixed-role, anchor-relative, and absolute-depth imports remain explainable without flattening them into misleading hook summaries.

That is the correct tradeoff for maintainability. It keeps the hook plane honest and leaves the missing fidelity to the context-engine work in Phase 3, which is where it belongs.
