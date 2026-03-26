# SillyClaw

SillyTavern preset importer and prompt-placement runtime for OpenClaw.

SillyClaw v2 is a clean-break rewrite around a canonical prompt model, a conservative hook renderer, and a SillyClaw-owned context engine for history-relative and absolute-depth placement.

## Status
Current runtime shape:

- v2 is the only active runtime path
- all imported SillyTavern `prompt_order` scopes are preserved
- hooks render only exact outer-envelope placements
- the `sillyclaw` context engine handles history-relative and absolute-depth placement
- cache authority lives in `v2/indexes/stacks.json`
- tooling exposes placement summaries, diagnostics, and cache stats

Current hard boundary:

- OpenClaw does not expose insertion anchors inside its kernel system prompt
- imported prompts that are relative to internal SillyTavern anchors such as persona or scenario therefore cannot be reproduced as exact internal system-anchor insertions
- SillyClaw documents those boundaries explicitly instead of fabricating false hook semantics

## What It Supports

- SillyTavern prompt imports with flat or per-character `prompt_order`
- preservation of every source scope as a selectable v2 stack
- `USER.md` as persona
- `SOUL.md` + `IDENTITY.md` as character
- exact hook placement for the small subset OpenClaw actually exposes
- context-engine placement before history, after history, and by absolute depth

Not supported as runtime behavior:

- SillyTavern advanced macro execution
- SillyTavern regex/runtime extensions

Those syntaxes are imported as opaque text and reported in diagnostics.

## Quick Start

1. Install and enable the plugin.

```bash
openclaw plugins install sillyclaw
# or for local development:
openclaw plugins install -l /path/to/SillyClaw
openclaw plugins enable sillyclaw
```

2. Select the context engine slot if you want full placement fidelity.

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "sillyclaw"
    }
  }
}
```

Without that slot, SillyClaw still runs in degraded hook-only mode.

3. Import a SillyTavern preset.

```bash
openclaw sillyclaw import ./my-preset.json
```

4. List the generated stacks and choose one.

```bash
openclaw sillyclaw stacks list
openclaw sillyclaw stacks use <stackId>
```

5. Inspect the compiled result.

```bash
openclaw sillyclaw active
openclaw sillyclaw stacks inspect <stackId>
openclaw sillyclaw stacks diagnostics <stackId>
openclaw sillyclaw cache stats
```

## CLI

Import and state:

- `openclaw sillyclaw import <file> [--name <name>]`
- `openclaw sillyclaw active [--agent <agentId>] [--session <sessionKey>]`
- `openclaw sillyclaw state`
- `openclaw sillyclaw cache stats`

Layers:

- `openclaw sillyclaw layers list`
- `openclaw sillyclaw layers show <layerId>`

Stacks:

- `openclaw sillyclaw stacks list`
- `openclaw sillyclaw stacks show <stackId>`
- `openclaw sillyclaw stacks inspect <stackId>`
- `openclaw sillyclaw stacks diagnostics <stackId>`
- `openclaw sillyclaw stacks use <stackId> [--agent <agentId> | --session <sessionKey>]`

Observability rules:

- `stacks list` is index-backed and shows cached placement summaries when available
- `stacks inspect` shows safe structural summaries, not prompt-body dumps
- `stacks diagnostics` shows import and planner diagnostics for one stack
- `cache stats` reports cold, warm, stale, tracked, stored, and orphaned artifact counts

## Data Layout

SillyClaw stores v2 data under:

```text
<dataDir>/
  v2/
    state.json
    indexes/
      layers.json
      stacks.json
    layers/
    stacks/
    artifacts/
```

Key rules:

- `state.json` is selection-only
- `indexes/stacks.json` is the single cache authority
- artifact-backed placement summaries are cached in the stack index

See `docs/data-formats-v2.md` and `docs/refactoring-plan-v2.md`.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
