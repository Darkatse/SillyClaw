# SillyClaw

SillyTavern preset importer + roleplay prompt overlays for OpenClaw.

English | [中文](README.zh-CN.md)

SillyClaw is an OpenClaw plugin that:

- imports SillyTavern “Prompt Manager” preset JSON (as an input format),
- converts it into SillyClaw-owned JSON (preset layers + stacks),
- injects compiled prompt overlays using OpenClaw’s typed `before_prompt_build` hook,
- preserves OpenClaw’s kernel system prompt (no `systemPrompt` override in normal operation).

This repo intentionally targets a **subset** of SillyTavern semantics. The primary goal is stable, deterministic prompt overlay injection with fast persona switching.

## Status

- Schema: v1 only (missing `schemaVersion` is treated as v1; other versions throw).
- `appendSystemContext` / `system.append` blocks: explicitly deferred (compile-time error).

## Quick start (operator workflow)

1. Install and enable the plugin (local dev link):

```bash
openclaw plugins install -l /path/to/SillyClaw
openclaw plugins enable sillyclaw
```

2. Import a SillyTavern preset JSON:

```bash
openclaw sillyclaw import ./my-preset.json
```

3. List imported preset layers and create a stack (base → overlays):

```bash
openclaw sillyclaw presets list
openclaw sillyclaw stacks create "My Stack" --layers <presetId1>,<presetId2>
```

4. (Optional) Set macro mappings if prompts contain `{{char}}` / `{{user}}`:

```bash
openclaw sillyclaw stacks set-macros <stackId> --char "Alice" --user "Bob"
```

5. Activate the stack (default / per-agent / per-session):

```bash
openclaw sillyclaw stacks use <stackId>
openclaw sillyclaw stacks use <stackId> --agent agentA
openclaw sillyclaw stacks use <stackId> --session sessionX
```

6. Verify what’s active (safe summary only; no prompt text dumps):

```bash
openclaw sillyclaw active
openclaw sillyclaw active --agent agentA
openclaw sillyclaw active --session sessionX
```

## How it works (at a glance)

- SillyClaw stores **preset layers** and **preset stacks** in its own `dataDir` (not in OpenClaw’s main config).
- At runtime, it resolves the active stack with precedence:
  - `sessionKey` selection → `agentId` selection → global default → none.
- It compiles the stack into OpenClaw’s supported injection fields only:
  - `prependSystemContext` (system-space overlay)
  - `prependContext` (user-prompt prefix overlay; used to approximate “after chat history” prompts)
- Macro substitution supports only:
  - `{{char}}`
  - `{{user}}`

## Configuration

Plugin config lives under `plugins.entries.sillyclaw.config`.

Supported fields (see `openclaw.plugin.json`):

- `dataDir` (string): where SillyClaw stores state/presets/stacks.
  - Default: `$OPENCLAW_STATE_DIR/sillyclaw`
  - If `$OPENCLAW_STATE_DIR` is unset, OpenClaw defaults to `~/.openclaw`.
- `debug` (boolean): enables verbose SillyClaw logging.

Example (shape only; exact file/location is OpenClaw-specific):

```json
{
  "plugins": {
    "entries": {
      "sillyclaw": {
        "enabled": true,
        "config": {
          "dataDir": "~/.openclaw/sillyclaw",
          "debug": false
        }
      }
    }
  }
}
```

## CLI reference

Top-level:

- `openclaw sillyclaw import <file> [--name ...] [--main-target system.prepend|user.prepend]`
- `openclaw sillyclaw active [--agent ...] [--session ...]`
- `openclaw sillyclaw state`

Preset layers:

- `openclaw sillyclaw presets list`
- `openclaw sillyclaw presets show <presetId>` (shows metadata and block sizes only)
- `openclaw sillyclaw presets export <presetId> [--out file]`

Stacks:

- `openclaw sillyclaw stacks create <name> --layers <id1,id2,...>`
- `openclaw sillyclaw stacks list`
- `openclaw sillyclaw stacks inspect <stackId>` (safe summary + injection sizes)
- `openclaw sillyclaw stacks rename <stackId> <name>`
- `openclaw sillyclaw stacks set-layers <stackId> --layers <id1,id2,...>`
- `openclaw sillyclaw stacks add-layer <stackId> <presetId> [--index n]`
- `openclaw sillyclaw stacks remove-layer <stackId> <presetId> [--all]`
- `openclaw sillyclaw stacks set-macros <stackId> [--char ...] [--user ...]`
- `openclaw sillyclaw stacks use <stackId> [--agent ... | --session ...]`
- `openclaw sillyclaw stacks delete <stackId>`

## Data directory layout

Under `dataDir`:

- `state.json`: active stack selections (default / per-agent / per-session)
- `presets/<presetLayerId>.json`: stored preset layers
- `stacks/<stackId>.json`: stored stacks

See `docs/data-formats.md` for the current JSON formats.

## SillyTavern import semantics (current)

SillyClaw supports two common `prompt_order` shapes:

- PromptManager export: `prompt_order` is a flat list of `{ identifier, enabled }`
- OpenAI preset format: `prompt_order` is a per-character list, and SillyClaw prefers `character_id` `100001`, falling back to `100000`.

Mapping to SillyClaw targets:

- `main` (identifier `main`) defaults to `system.prepend` and can be overridden via `--main-target`.
- Prompts **after** `chatHistory` map to `user.prepend`.
- Everything else maps to `system.prepend`.
- Marker prompts (`marker: true`) are ignored.
- If `prompt_order` references a prompt definition that does not exist in `prompts`, it is skipped.

## Diagnostics & privacy

- With `debug: true`, SillyClaw logs only stack id/name/scope and injected character counts (not prompt bodies).
- When `{{char}}` / `{{user}}` appear but a mapping is missing, SillyClaw leaves the placeholder intact and logs a warning with the command to set mappings.

## Development

- Development guide: `docs/development.md`
- Design docs:
  - `docs/project-constraint-guidelines.md`
  - `docs/architecture-design.md`
  - `docs/prd-and-roadmap.md`

Common commands:

```bash
npm install
npm run typecheck
npm test
```

## License

MIT (see `LICENSE`).
