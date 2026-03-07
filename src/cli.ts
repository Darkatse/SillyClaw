import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { SillyClawRuntime } from "./runtime.js";
import type { MacroMapping, PresetBlockTarget } from "./types.js";

export function registerSillyClawCli(params: { api: OpenClawPluginApi; runtime: SillyClawRuntime }): void {
  params.api.registerCli(
    ({ program }) => {
      const p = program as any;

      const root = p.command("sillyclaw").description("Manage SillyClaw preset layers and stacks.");

      root
        .command("import")
        .argument("<file>", "Path to a SillyTavern preset JSON file")
        .option("--name <name>", "Override imported preset layer name")
        .option(
          "--main-target <target>",
          'Where to place SillyTavern "main" (system.prepend|user.prepend)',
        )
        .action(async (file: string, opts: { name?: string; mainTarget?: string }) => {
          const preset = await params.runtime.importSillyTavernFromFile({
            filePath: file,
            name: opts.name,
            mainTarget: opts.mainTarget ? parsePresetBlockTarget(opts.mainTarget) : undefined,
          });
          console.log(JSON.stringify({ ok: true, presetId: preset.id, name: preset.name }, null, 2));
        });

      root
        .command("active")
        .description("Resolve the active stack selection and show injected sizes.")
        .option("--agent <agentId>", "Resolve using an agent id (lower precedence than --session)")
        .option("--session <sessionKey>", "Resolve using a session key (highest precedence)")
        .action(async (opts: { agent?: string; session?: string }) => {
          const result = await params.runtime.inspectActive({ agentId: opts.agent, sessionKey: opts.session });
          console.log(JSON.stringify(result, null, 2));
        });

      const presets = root.command("presets").description("Preset layer operations");
      presets.command("list").action(async () => {
        const items = await params.runtime.listPresets();
        items.sort((a, b) => a.name.localeCompare(b.name));
        console.log(
          JSON.stringify(
            items.map((x) => ({ id: x.id, name: x.name, blocks: x.blocks.length, source: x.source?.kind })),
            null,
            2,
          ),
        );
      });

      presets
        .command("show")
        .argument("<presetId>", "Preset layer id")
        .action(async (presetId: string) => {
          const preset = await params.runtime.loadPreset(presetId);
          console.log(
            JSON.stringify(
              {
                id: preset.id,
                name: preset.name,
                source: preset.source,
                blocks: preset.blocks.map((b) => ({
                  target: b.target,
                  order: b.order,
                  enabled: b.enabled !== false,
                  blockKey: b.blockKey,
                  chars: b.text.length,
                })),
              },
              null,
              2,
            ),
          );
        });

      presets
        .command("export")
        .argument("<presetId>", "Preset layer id")
        .option("--out <file>", "Write JSON to a file (prints to stdout if omitted)")
        .action(async (presetId: string, opts: { out?: string }) => {
          const preset = await params.runtime.loadPreset(presetId);
          const json = JSON.stringify(preset, null, 2) + "\n";
          if (opts.out) {
            const outPath = path.resolve(opts.out);
            await fs.mkdir(path.dirname(outPath), { recursive: true });
            await fs.writeFile(outPath, json, "utf-8");
            console.log(JSON.stringify({ ok: true, out: outPath }, null, 2));
            return;
          }
          process.stdout.write(json);
        });

      const stacks = root.command("stacks").description("Stack operations");
      stacks
        .command("create")
        .argument("<name>", "Stack name")
        .requiredOption("--layers <ids>", "Comma-separated preset layer ids (base → overlays)")
        .action(async (name: string, opts: { layers: string }) => {
          const layers = parseCsv(opts.layers);
          const stack = await params.runtime.createStack({ name, layers });
          console.log(JSON.stringify({ ok: true, stackId: stack.id, name: stack.name, layers: stack.layers }, null, 2));
        });

      stacks.command("list").action(async () => {
        const items = await params.runtime.listStacks();
        items.sort((a, b) => a.name.localeCompare(b.name));
        console.log(
          JSON.stringify(
            items.map((x) => ({ id: x.id, name: x.name, layers: x.layers, macros: x.macros ?? {} })),
            null,
            2,
          ),
        );
      });

      stacks
        .command("inspect")
        .argument("<stackId>", "Stack id")
        .action(async (stackId: string) => {
          const result = await params.runtime.inspectStack({ stackId });
          console.log(
            JSON.stringify(
              {
                id: result.stack.id,
                name: result.stack.name,
                layers: result.layers.map((l) => ({
                  id: l.id,
                  name: l.name,
                  blocks: l.blocks.length,
                  enabledBlocks: l.blocks.filter((b) => b.enabled !== false && b.text.trim()).length,
                })),
                macros: result.stack.macros ?? {},
                injectionSizes: result.injectionSizes,
                missingMacros: result.missingMacros,
              },
              null,
              2,
            ),
          );
        });

      stacks
        .command("rename")
        .argument("<stackId>", "Stack id")
        .argument("<name>", "New stack name")
        .action(async (stackId: string, name: string) => {
          const stack = await params.runtime.updateStack({ stackId, name });
          console.log(JSON.stringify({ ok: true, stackId: stack.id, name: stack.name }, null, 2));
        });

      stacks
        .command("set-layers")
        .argument("<stackId>", "Stack id")
        .requiredOption("--layers <ids>", "Comma-separated preset layer ids (base → overlays)")
        .action(async (stackId: string, opts: { layers: string }) => {
          const layers = parseCsv(opts.layers);
          const stack = await params.runtime.updateStack({ stackId, layers });
          console.log(JSON.stringify({ ok: true, stackId: stack.id, layers: stack.layers }, null, 2));
        });

      stacks
        .command("add-layer")
        .argument("<stackId>", "Stack id")
        .argument("<presetId>", "Preset layer id to add")
        .option("--index <n>", "Insert at index (0-based). Defaults to append.")
        .action(async (stackId: string, presetId: string, opts: { index?: string }) => {
          const stack = await params.runtime.loadStack(stackId);
          const layers = [...stack.layers];
          const index = opts.index === undefined ? layers.length : parseIntStrict(opts.index, "--index");
          if (index < 0 || index > layers.length) {
            throw new Error(`--index out of range (0..${layers.length})`);
          }
          layers.splice(index, 0, presetId);
          const updated = await params.runtime.updateStack({ stackId, layers });
          console.log(JSON.stringify({ ok: true, stackId: updated.id, layers: updated.layers }, null, 2));
        });

      stacks
        .command("remove-layer")
        .argument("<stackId>", "Stack id")
        .argument("<presetId>", "Preset layer id to remove")
        .option("--all", "Remove all occurrences")
        .action(async (stackId: string, presetId: string, opts: { all?: boolean }) => {
          const stack = await params.runtime.loadStack(stackId);
          let layers = [...stack.layers];
          if (opts.all) {
            layers = layers.filter((x) => x !== presetId);
          } else {
            const idx = layers.indexOf(presetId);
            if (idx === -1) {
              throw new Error("Layer not found in stack.");
            }
            layers.splice(idx, 1);
          }
          const updated = await params.runtime.updateStack({ stackId, layers });
          console.log(JSON.stringify({ ok: true, stackId: updated.id, layers: updated.layers }, null, 2));
        });

      stacks
        .command("delete")
        .argument("<stackId>", "Stack id")
        .action(async (stackId: string) => {
          await params.runtime.deleteStack({ stackId });
          console.log(JSON.stringify({ ok: true }, null, 2));
        });

      stacks
        .command("use")
        .argument("<stackId>", "Stack id to activate")
        .option("--agent <agentId>", "Set per-agent stack selection instead of global default")
        .option("--session <sessionKey>", "Set per-session stack selection instead of global default")
        .action(async (stackId: string, opts: { agent?: string; session?: string }) => {
          if (opts.agent && opts.session) {
            throw new Error("Use either --agent or --session, not both.");
          }
          const state = await params.runtime.useStack({ stackId, agentId: opts.agent, sessionKey: opts.session });
          console.log(JSON.stringify({ ok: true, state }, null, 2));
        });

      stacks
        .command("set-macros")
        .argument("<stackId>", "Stack id")
        .option("--char <name>", "Value for {{char}}")
        .option("--user <name>", "Value for {{user}}")
        .action(async (stackId: string, opts: { char?: string; user?: string }) => {
          const macros: MacroMapping = {};
          if (typeof opts.char === "string") {
            macros.char = opts.char;
          }
          if (typeof opts.user === "string") {
            macros.user = opts.user;
          }
          if (Object.keys(macros).length === 0) {
            throw new Error("No macros provided. Use --char and/or --user.");
          }
          const stack = await params.runtime.setStackMacros({ stackId, macros });
          console.log(JSON.stringify({ ok: true, stackId: stack.id, macros: stack.macros ?? {} }, null, 2));
        });

      root.command("state").description("Show SillyClaw runtime state").action(async () => {
        const state = await params.runtime.loadState();
        console.log(JSON.stringify(state, null, 2));
      });
    },
    { commands: ["sillyclaw"] },
  );
}

function parseCsv(value: string): string[] {
  const ids = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("Expected a non-empty comma-separated list.");
  }
  return ids;
}

function parsePresetBlockTarget(value: string): PresetBlockTarget {
  if (value === "system.prepend" || value === "user.prepend") {
    return value;
  }
  throw new Error(`Invalid target: ${value}`);
}

function parseIntStrict(value: string, label: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new Error(`Invalid integer for ${label}: ${value}`);
  }
  return n;
}
