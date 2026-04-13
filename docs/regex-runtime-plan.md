# Regex Runtime Integration Plan

This document defines the execution plan for adding SillyTavern preset regex support to the active SillyClaw v2 architecture.

It is intentionally scoped to the current product goal:

- import and manage request-time regex rules,
- execute them against transcript history before the LLM request is built,
- keep the v2 placement planner and renderers clean,
- avoid importing display-only Markdown beautification rules.

## 1. Problem Framing

SillyClaw v2 already models prompt placement well:

- `fragments` describe prompt definitions,
- `scopes` preserve `prompt_order`,
- the planner resolves placement,
- hook/context-engine renderers compile stack artifacts.

SillyTavern regex rules are a different concern.

They do not describe where prompt content goes.
They describe how text should be transformed before a request is sent.

Trying to encode regex rules inside the placement model would blur responsibilities:

- `fragment/scope/planner` would stop being a placement model,
- regex execution order would be hidden inside unrelated prompt structures,
- maintenance cost would grow quickly.

Therefore regex support must be added as a parallel transformation pipeline.

## 2. Fixed Decisions

These decisions are now part of the implementation contract.

### 2.1 `markdownOnly` dominates

If a SillyTavern regex rule has:

- `markdownOnly === true`, or
- `markdownOnly === true && promptOnly === true`

it is not imported into SillyClaw.

Reason:

- those rules are display/UI beautification rules,
- they are not request-time prompt transformations,
- importing them would leak presentation logic into runtime context assembly.

### 2.2 Separate regex import is supported

In addition to:

- `openclaw sillyclaw import <file> --with-regex`

SillyClaw will support standalone regex import bound to an existing layer.

Proposed command:

- `openclaw sillyclaw layers regex import <layerId> <file>`

This command replaces the target layer's regex rule set with the supported rules imported from the supplied SillyTavern preset file.

Reason:

- regex rules are owned by the layer,
- layer ownership gives clean stack composition semantics,
- replacement is deterministic and avoids duplicate accumulation.

## 3. First-Principles Design

### 3.1 Regex belongs to the layer, not the scope

SillyTavern preset regex rules live at preset level, not per `prompt_order` scope.

Therefore the canonical owner in SillyClaw is:

- `PresetLayerV2`

not:

- `PromptScopeV2`
- `PromptFragmentV2`
- `RenderPlanV2`

### 3.2 Regex is compiled into the artifact, not interpreted from live layers on every run

The active v2 runtime already depends on:

- `state.json` for selection,
- `indexes/stacks.json` for cache identity,
- `artifacts/<artifactKey>.json` for compiled execution data.

Regex support must follow that same contract.

Reason:

- no extra warm-path hydration,
- regex execution stays deterministic,
- stack cache invalidation remains layer-driven.

### 3.3 Runtime execution belongs to the context engine path

The user requirement is request-time history rewriting before the LLM API call.

That cannot be expressed correctly through `before_prompt_build` alone because hooks can:

- prepend system context,
- prepend prompt context,

but they cannot rewrite already assembled history messages.

Therefore regex execution belongs to:

- SillyClaw context-engine `assemble`

Specifically:

1. load active artifact,
2. apply regex artifact to transcript messages,
3. apply existing engine insertions,
4. return final messages to OpenClaw.

### 3.4 Scope must stay intentionally narrow

The first implementation supports only request-time prompt regex rules.

Supported runtime scope:

- transcript `user` messages,
- transcript `assistant` messages,
- request-time depth filtering.

Explicitly out of scope in this phase:

- Markdown display regex,
- editor-time regex,
- slash-command regex,
- reasoning regex,
- world-info regex,
- ST regex macro substitution in `findRegex`,
- `trimStrings`,
- arbitrary UI/runtime beautification logic.

## 4. Supported Import Subset

SillyClaw will import only rules that are valid for request-time transcript rewriting.

### 4.1 A rule is importable when

All of the following hold:

- `markdownOnly !== true`
- `promptOnly === true`
- `placement` is a non-empty subset of:
  - `1` (`USER_INPUT`)
  - `2` (`AI_OUTPUT`)
- `substituteRegex === 0`
- `trimStrings` is empty or omitted
- `findRegex` is a string
- `replaceString` is a string
- `id` is a string

### 4.2 A rule is skipped when

- `markdownOnly === true`
- `promptOnly !== true`
- `placement` contains unsupported targets
- `substituteRegex !== 0`
- `trimStrings` is non-empty

Skipped rules are not silent:

- import output must report explicit counts by skip reason.

### 4.3 A rule import throws when

- the preset file shape is malformed,
- a rule uses invalid types for required fields,
- a supposedly supported field is structurally invalid.

Malformed input is an error.
Known out-of-scope semantics are explicit skips.

## 5. Canonical Model Additions

## 5.1 `PresetLayerV2`

Add:

- `regexSource?: PresetLayerSourceV2`
- `regexRules: RegexRuleV2[]`

`regexSource` records provenance for the currently bound regex set.

`regexRules` is ordered storage.
Rule order is the array order.

### 5.2 `RegexRuleV2`

Recommended shape:

- `id: string`
- `name: string`
- `findRegex: string`
- `replaceString: string`
- `placements: RegexPlacementV2[]`
- `disabled: boolean`
- `minDepth?: number`
- `maxDepth?: number`

### 5.3 `RegexPlacementV2`

Canonical string enum:

- `"user-input"`
- `"ai-output"`

SillyClaw does not store raw ST numeric placement values in the canonical model.

## 5.4 `StackArtifactV2`

Add:

- `regexArtifact?: RegexArtifactV2`

### 5.5 `RegexArtifactV2`

Recommended shape:

- `rules: CompiledRegexRuleV2[]`

### 5.6 `CompiledRegexRuleV2`

Recommended shape:

- `key: string`
- `stackId: string`
- `layerId: string`
- `ruleId: string`
- `name: string`
- `findRegex: string`
- `replaceString: string`
- `placements: RegexPlacementV2[]`
- `minDepth?: number`
- `maxDepth?: number`

`key` must be stable and include stack/layer/rule identity.

## 6. Import and Binding Flows

### 6.1 Initial preset import with regex

Command:

- `openclaw sillyclaw import <file> --with-regex`

Flow:

1. parse prompts and scopes as today,
2. parse supported regex rules from the same source file,
3. write one layer containing:
   - prompts/scopes,
   - regex rules,
   - `source`,
   - `regexSource` equal to the same provenance,
4. create stacks as today.

### 6.2 Standalone regex import bound to an existing layer

Command:

- `openclaw sillyclaw layers regex import <layerId> <file>`

Flow:

1. load target layer,
2. import supported regex rules from the supplied file,
3. replace `layer.regexRules`,
4. replace `layer.regexSource`,
5. save layer,
6. invalidate referenced stack artifacts through existing layer-save behavior.

This command does not edit:

- fragments,
- scopes,
- stacks.

It only changes the layer-owned regex set.

## 7. Management CLI

### 7.1 Read surface

Add:

- `openclaw sillyclaw layers regex list <layerId>`
- `openclaw sillyclaw layers regex show <layerId> <ruleId>`

### 7.2 Write surface

Add:

- `openclaw sillyclaw layers regex import <layerId> <file>`
- `openclaw sillyclaw layers regex enable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex disable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex move <layerId> <ruleId> --before <otherRuleId>`
- `openclaw sillyclaw layers regex move <layerId> <ruleId> --after <otherRuleId>`

This phase deliberately does not add raw rule authoring commands such as:

- set find regex,
- set replace string,
- add new rule by hand,
- delete rule.

That keeps the implementation small and aligned with the real source-of-truth workflow:

- import from SillyTavern,
- bind to a layer,
- manage enablement/order.

## 8. Runtime Execution Model

### 8.1 Artifact compilation

At stack compile time:

1. collect unique stack layer ids in stack order,
2. take enabled regex rules from each collected layer,
3. compile them into `regexArtifact.rules`.

Important:

- if the same layer appears multiple times in one stack, its regex rules are compiled once,
- regex semantics are layer-owned, not scope-owned.

### 8.2 Request-time execution

Execution point:

- `runtime.buildContextMessages()`

Order:

1. resolve active artifact,
2. apply `regexArtifact` to transcript messages,
3. apply `engineArtifact` insertions,
4. return final message array.

Regex runs before engine insertions because the product goal is transcript rewriting, not mutation of synthetic engine instructions.

### 8.3 Message targeting

Placement mapping:

- `"user-input"` applies to transcript messages with `role === "user"`
- `"ai-output"` applies to transcript messages with `role === "assistant"`

Other message roles are not touched.

### 8.4 Depth semantics

Use SillyTavern-compatible prompt depth counting for history messages:

- newest included message has depth `0`
- older messages have increasing depth

Formula for oldest-first arrays:

- `depth = messages.length - index - 1`

Rule checks:

- skip when `depth < minDepth`
- skip when `depth > maxDepth`

Bounds are inclusive when present.

### 8.5 Content handling

Rules apply to text content only.

Safe runtime behavior:

- string content is transformed directly,
- structured text blocks are transformed per text block,
- non-text content is preserved untouched.

This preserves OpenClaw message contracts and avoids rewriting attachment/tool structures.

## 9. Module Design

### 9.1 New or expanded modules

Recommended structure:

- `src/v2/import/sillytavern-shared.ts`
  - shared ST object parsing helpers
- `src/v2/import/sillytavern-regex.ts`
  - regex import normalization
- `src/v2/regex.ts`
  - artifact compilation
  - request-time application

Expanded existing modules:

- `src/v2/model.ts`
- `src/v2/schema.ts`
- `src/v2/store.ts`
- `src/v2/runtime.ts`
- `src/v2/layer-mutations.ts`
- `src/v2/import/sillytavern.ts`
- `src/cli.ts`

### 9.2 Boundary rules

`planner.ts` must not become regex-aware.

`render-hooks.ts` must remain placement-only.

`render-context-engine.ts` must remain placement-only.

Regex execution belongs in the runtime-side message transformation path, not in the placement planner or renderer modules.

## 10. Mutation Model

Regex rule management is a layer mutation concern.

Add pure mutations for:

- replace regex rule set,
- enable/disable rule,
- move rule before/after another rule.

These mutations should:

- throw on missing targets,
- keep rule order contiguous,
- remain immutable/pure,
- let runtime orchestration own persistence and stack invalidation.

## 11. Output and Observability

### 11.1 Import output

Regex-enabled imports should report:

- imported count,
- skipped count,
- skipped markdown-only count,
- skipped non-prompt count,
- skipped unsupported placement count,
- skipped unsupported substitution/trim count.

### 11.2 Layer inspection

`layers show` should include:

- regex rule count,
- regex source provenance when present.

### 11.3 Stack inspection

`stacks inspect` should include:

- regex artifact rule summaries,
- rule keys,
- layer provenance,
- placements,
- depth bounds.

No prompt bodies are exposed through these summaries.

## 12. Testing Plan

Add or extend tests for:

### 12.1 Import

- imports supported prompt regex rules,
- skips `markdownOnly` rules,
- skips non-`promptOnly` rules,
- skips unsupported placement/substitution/trim semantics,
- preserves regex source provenance when imported.

### 12.2 Layer mutations

- enable/disable regex rule,
- move regex rule,
- replace regex rules on standalone import,
- invalid target throws.

### 12.3 Artifact compilation

- compiles unique layer-owned regex rules in stack order,
- excludes disabled rules,
- does not duplicate rules when the same layer appears twice.

### 12.4 Runtime execution

- rewrites user history only for `user-input`,
- rewrites assistant history only for `ai-output`,
- respects min/max depth,
- preserves non-target roles,
- composes regex rewriting before engine insertions.

## 13. Compatibility and Migration

No schema-version bump is required for this phase.

Reason:

- all additions are backward-compatible optional fields,
- existing layers with no regex fields continue to parse and render identically,
- regex behavior only appears when the user explicitly imports or binds regex rules.

This preserves the current rendering behavior of already imported layers.

## 14. Implementation Order

Recommended order:

1. land this design doc,
2. extend canonical model and schema,
3. implement regex import normalization,
4. implement layer regex mutations,
5. wire artifact compilation,
6. wire runtime request-time execution,
7. expose CLI commands,
8. update README/docs,
9. add tests and verify.
