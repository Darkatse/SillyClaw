# Preset Management CLI Execution Plan

## 1. Problem Statement

SillyClaw v2 already has a strong runtime model:

- imported SillyTavern prompt definitions become `fragments`,
- every imported `prompt_order` becomes a preserved `scope`,
- one stack is generated per imported scope,
- the planner and both renderers compile from the canonical v2 model.

The current operator problem is not runtime fidelity. The current problem is missing write-side tooling.

Today an operator can:

- import a preset,
- inspect layers and stacks,
- inspect diagnostics and placement,
- activate a stack.

Today an operator cannot cleanly:

- view one scope as editable entries,
- enable or disable one imported prompt inside one scope,
- move one prompt within one scope,
- edit one prompt body,
- change one prompt's insertion semantics.

That gap makes imported presets hard to maintain even though the runtime path is already working well.

## 2. First-Principles Design Rules

This implementation will follow these rules.

### 2.1 Edit the canonical model directly

Do not introduce a new flattened "editable preset entry" storage model.

Why:

- v2 already has the right canonical split:
  - `fragment` owns prompt definition data,
  - `scope entry` owns enablement and order inside one preserved source scope.
- flattening that into a new write model would create dual truth and long-term drift.

Decision:

- content and insertion edits target `fragments`,
- enable/disable and move operations target `scope entries`.

### 2.2 Keep read paths cheap

The common path remains:

- list uses indexes,
- inspect/edit loads only the requested layer,
- stack recompilation stays on-demand,
- artifact invalidation remains selective.

No startup hydration will be added.

### 2.3 Recompute derived values in one place

Layer edits can change:

- `fragment.featureFlags`,
- `layer.featureSummary`,
- `scope.preferredRenderer`,
- `layer.diagnostics`,
- `stack.preferredRenderer` for stacks that reference the edited layer.

These derived values must not be recomputed ad hoc in CLI code or duplicated between importer and editor paths.

Decision:

- extract shared pure derivation helpers,
- route both import and edit flows through those helpers.

### 2.4 Fail fast on invalid targets

This control surface is an operator tool.

If the operator references:

- a missing layer,
- a missing scope,
- a missing fragment,
- an invalid move target,
- an invalid insertion shape,

the command should throw a clear error immediately.

No silent downgrade.
No best-effort guessing.

### 2.5 Avoid schema churn unless it buys real value

This phase will not introduce a new on-disk schema version.

Reason:

- the required operator control surface can be built on the current v2 layer and stack files,
- introducing a schema bump for metadata alone would add migration work without changing the core edit model.

Decision:

- keep `PresetLayerV2` and `StackV2` file shapes stable in this phase,
- reinterpret `indexes/layers.json.updatedAt` as the last persisted time for the index entry,
- preserve `source.importedAt` strictly as import provenance.

## 3. Target UX

The operator should be able to discover and modify imported presets without opening raw JSON files.

### 3.1 Read-side CLI

Add focused read commands below the existing `layers` surface:

- `openclaw sillyclaw layers scopes list <layerId>`
- `openclaw sillyclaw layers scopes show <layerId> <scopeId>`
- `openclaw sillyclaw layers fragments list <layerId>`
- `openclaw sillyclaw layers fragments show <layerId> <fragmentId>`

These commands should make the model understandable:

- scopes show preserved `prompt_order`,
- fragments show reusable prompt definitions,
- scope output enriches entries with fragment metadata so an operator can see what is enabled, where it sits, and what kind of prompt it is.

### 3.2 Write-side CLI

Add the minimum complete mutation surface:

- `openclaw sillyclaw layers scopes enable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes disable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes move <layerId> <scopeId> <fragmentId> --before <otherFragmentId>`
- `openclaw sillyclaw layers scopes move <layerId> <scopeId> <fragmentId> --after <otherFragmentId>`
- `openclaw sillyclaw layers fragments set-content <layerId> <fragmentId> [--text <text> | --file <file> | --stdin]`
- `openclaw sillyclaw layers fragments set-insertion <layerId> <fragmentId> --relative`
- `openclaw sillyclaw layers fragments set-insertion <layerId> <fragmentId> --absolute --depth <n> --order <n>`

Why these commands:

- they satisfy the concrete user requirement,
- they map cleanly onto the canonical model,
- they do not invent transitional abstractions.

### 3.3 Deliberately deferred

This phase will not add:

- raw JSON patch commands,
- fragment creation or deletion,
- scope creation or deletion,
- stack composition editing,
- `$EDITOR` integration,
- automatic import-source synchronization.

Those can be added later if there is clear demand.

## 4. Internal Design

### 4.1 Shared layer derivation module

Add a pure module responsible for layer-derived fields.

Responsibilities:

- detect feature flags from fragment content,
- resolve one scope's `preferredRenderer`,
- rebuild `layer.featureSummary`,
- rebuild `layer.diagnostics`,
- rebuild every scope's derived renderer preference.

This module becomes the single authority used by:

- the importer,
- runtime edit operations.

### 4.2 Shared layer mutation module

Add a pure module responsible for canonical layer mutations.

Responsibilities:

- locate fragment and scope targets,
- enable or disable a scope entry,
- move a scope entry and reassign contiguous ordinals,
- update fragment content and refresh feature flags,
- update fragment insertion semantics,
- return the next immutable `PresetLayerV2`.

This keeps CLI and runtime free from model mutation details.

### 4.3 Stack renderer-preference recomputation

Editing one layer can change the effective renderer needs of any stack that references that layer.

Add a small pure helper:

- `hooks < hybrid < context-engine`
- a stack's `preferredRenderer` becomes the strongest requirement among its referenced scopes

This preserves observability correctness after edits.

### 4.4 Runtime-level application service

Expose edit operations from the v2 runtime instead of writing files in CLI handlers.

Runtime responsibilities:

- load the target layer,
- apply a pure mutation,
- save the layer,
- find affected stacks,
- recompute and persist stack `preferredRenderer` where needed,
- rely on existing store invalidation to clear stale artifacts,
- return a concise result payload for CLI output.

This keeps module boundaries clean:

- CLI parses arguments,
- runtime orchestrates persistence,
- pure modules own the model logic.

## 5. Data and Cache Rules

### 5.1 Layer persistence

Layer edits will continue to persist through `store.saveLayer`.

That already gives:

- atomic writes,
- layer index refresh,
- selective invalidation of stacks referencing that layer.

### 5.2 Stack persistence after layer edits

After a layer edit, any referencing stack whose `preferredRenderer` changes must be saved back through `store.saveStack`.

This ensures:

- stack file stays truthful,
- stack index stays truthful,
- `active`, `stacks list`, and `stacks inspect` stay explainable.

### 5.3 Index timestamp rule

In this phase:

- layer index `updatedAt` means "last persisted to the layer store",
- stack index `updatedAt` means "last persisted to the stack store",
- layer file `source.importedAt` remains the original import timestamp.

## 6. Output Shape Principles

CLI output will stay JSON, consistent with the existing command surface.

Mutation commands should return:

- `ok: true`,
- the mutated target summary,
- the list of affected stack ids when relevant.

Read commands should prefer:

- ids,
- names,
- flags,
- insertion metadata,
- character counts,

and only print full prompt content when a fragment-specific command is explicitly used.

## 7. Test Plan

Add focused tests for:

### 7.1 Pure mutation behavior

- enabling and disabling one scope entry,
- moving one scope entry before and after another entry,
- setting fragment content updates `featureFlags`, `featureSummary`, and diagnostics,
- setting fragment insertion updates scope and stack renderer preferences.

### 7.2 Runtime orchestration

- editing a layer invalidates referenced stack artifacts,
- editing a layer updates affected stack `preferredRenderer`,
- edit APIs throw on missing layer/scope/fragment targets.

### 7.3 Existing behavior protection

- import behavior remains unchanged,
- active inspection stays warm-path friendly,
- stack compilation still reads the same canonical model.

## 8. Execution Order

### Phase A

- write this plan into `docs/`

### Phase B

- extract shared derivation helpers from import logic

### Phase C

- add pure layer mutation helpers

### Phase D

- expose runtime edit APIs and affected-stack recomputation

### Phase E

- wire the CLI read and write commands

### Phase F

- add tests and update README documentation

## 9. Why This Is the Best Path

This path is the highest-ROI option because it:

- solves the real operator pain immediately,
- preserves the v2 canonical model,
- avoids a second storage abstraction,
- keeps startup and warm paths untouched,
- localizes edit semantics into reusable pure functions,
- improves observability correctness instead of only adding commands.

It is simpler than introducing a new management layer, and more durable than asking operators to edit raw JSON directly.
