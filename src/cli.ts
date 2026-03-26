import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { SillyClawV2Runtime } from "./v2/runtime.js";

export function registerSillyClawCli(params: {
  api: OpenClawPluginApi;
  runtime: SillyClawV2Runtime;
}): void {
  params.api.registerCli(
    ({ program }) => {
      const p = program as any;
      const root = p.command("sillyclaw").description("Manage SillyClaw v2 layers, stacks, and planner output.");

      root
        .command("import")
        .argument("<file>", "Path to a SillyTavern preset JSON file")
        .option("--name <name>", "Override imported layer name")
        .action(async (file: string, opts: { name?: string }) => {
          const bundle = await params.runtime.importSillyTavernFromFile({
            filePath: file,
            name: opts.name,
          });

          console.log(
            JSON.stringify(
              {
                ok: true,
                layer: {
                  id: bundle.layer.id,
                  name: bundle.layer.name,
                  fragments: bundle.layer.fragments.length,
                  scopes: bundle.layer.scopes.map((scope) => ({
                    id: scope.id,
                    name: scope.name,
                    entries: scope.entries.length,
                    preferredRenderer: scope.preferredRenderer,
                  })),
                  diagnostics: bundle.layer.diagnostics.map((diagnostic) => ({
                    code: diagnostic.code,
                    severity: diagnostic.severity,
                    scopeId: diagnostic.scopeId,
                  })),
                },
                stacks: bundle.stacks.map((stack) => ({
                  id: stack.id,
                  name: stack.name,
                  preferredRenderer: stack.preferredRenderer,
                })),
              },
              null,
              2,
            ),
          );
        });

      root
        .command("active")
        .description("Resolve the active stack selection and show the current compiled summary.")
        .option("--agent <agentId>", "Resolve using an agent id (lower precedence than --session)")
        .option("--session <sessionKey>", "Resolve using a session key (highest precedence)")
        .action(async (opts: { agent?: string; session?: string }) => {
          const result = await params.runtime.inspectActive({
            agentId: opts.agent,
            sessionKey: opts.session,
          });
          console.log(JSON.stringify(result, null, 2));
        });

      root.command("state").description("Show SillyClaw v2 runtime state").action(async () => {
        console.log(JSON.stringify(await params.runtime.loadState(), null, 2));
      });

      const cache = root.command("cache").description("Inspect SillyClaw v2 cache state");
      cache.command("stats").action(async () => {
        console.log(JSON.stringify(await params.runtime.inspectCache(), null, 2));
      });

      const layers = root.command("layers").description("Inspect stored v2 layers");
      layers.command("list").action(async () => {
        console.log(JSON.stringify(await params.runtime.listLayerIndex(), null, 2));
      });

      layers
        .command("show")
        .argument("<layerId>", "Stored v2 layer id")
        .action(async (layerId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(
            JSON.stringify(
              {
                id: layer.id,
                name: layer.name,
                source: layer.source,
                fragments: layer.fragments.map((fragment) => ({
                  id: fragment.id,
                  name: fragment.name,
                  role: fragment.role,
                  marker: fragment.marker,
                  anchorBinding: fragment.anchorBinding,
                  insertion: fragment.insertion,
                  featureFlags: fragment.featureFlags,
                  chars: fragment.contentTemplate.length,
                })),
                scopes: layer.scopes,
                featureSummary: layer.featureSummary,
                diagnostics: layer.diagnostics,
              },
              null,
              2,
            ),
          );
        });

      const stacks = root.command("stacks").description("Inspect stored v2 stacks");
      stacks.command("list").action(async () => {
        console.log(JSON.stringify(await params.runtime.listStackIndex(), null, 2));
      });

      stacks
        .command("show")
        .argument("<stackId>", "Stored v2 stack id")
        .action(async (stackId: string) => {
          console.log(JSON.stringify(await params.runtime.loadStack(stackId), null, 2));
        });

      stacks
        .command("inspect")
        .argument("<stackId>", "Stored v2 stack id")
        .action(async (stackId: string) => {
          const result = await params.runtime.inspectStack({ stackId });
          console.log(
            JSON.stringify(
              {
                stack: {
                  id: result.stack.id,
                  name: result.stack.name,
                  preferredRenderer: result.stack.preferredRenderer,
                  layers: result.stack.layers,
                },
                layers: result.layers.map((layer) => ({
                  id: layer.id,
                  name: layer.name,
                  fragments: layer.fragments.length,
                  scopes: layer.scopes.length,
                })),
                placementSummary: result.placementSummary,
                diagnosticsSummary: result.diagnosticsSummary,
                artifact: {
                  key: result.artifact.key,
                  createdAt: result.artifact.createdAt,
                },
                injectionSizes: result.injectionSizes,
                hookEnvelope: {
                  prependSystem: result.plan.hookEnvelope.prependSystem.map(toEntrySummary),
                  appendSystem: result.plan.hookEnvelope.appendSystem.map(toEntrySummary),
                  prependContext: result.plan.hookEnvelope.prependContext.map(toEntrySummary),
                },
                engineArtifact: {
                  beforeHistory: result.artifact.engineArtifact?.beforeHistory.map(toInstructionSummary) ?? [],
                  afterHistory: result.artifact.engineArtifact?.afterHistory.map(toInstructionSummary) ?? [],
                  absolute:
                    result.artifact.engineArtifact?.absolute.map((instruction) => ({
                      ...toInstructionSummary(instruction),
                      depth: instruction.depth,
                      order: instruction.order,
                    })) ?? [],
                },
                engineInsertions: result.plan.engineInsertions.map((insertion) => ({
                  reason: insertion.reason,
                  ...toEntrySummary(insertion.entry),
                })),
              },
              null,
              2,
            ),
          );
        });

      stacks
        .command("diagnostics")
        .argument("<stackId>", "Stored v2 stack id")
        .action(async (stackId: string) => {
          const result = await params.runtime.inspectStack({ stackId });
          console.log(
            JSON.stringify(
              {
                stack: {
                  id: result.stack.id,
                  name: result.stack.name,
                  preferredRenderer: result.stack.preferredRenderer,
                },
                placementSummary: result.placementSummary,
                diagnosticsSummary: result.diagnosticsSummary,
                importDiagnostics: result.importDiagnostics.map((diagnostic) => ({
                  layerId: diagnostic.layerId,
                  layerName: diagnostic.layerName,
                  code: diagnostic.code,
                  severity: diagnostic.severity,
                  scopeId: diagnostic.scopeId,
                  message: diagnostic.message,
                })),
                planDiagnostics: result.planDiagnostics.map((diagnostic) => ({
                  code: diagnostic.code,
                  severity: diagnostic.severity,
                  layerId: diagnostic.layerId,
                  scopeId: diagnostic.scopeId,
                  fragmentId: diagnostic.fragmentId,
                  entryKey: diagnostic.entryKey,
                  message: diagnostic.message,
                })),
              },
              null,
              2,
            ),
          );
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
          const state = await params.runtime.useStack({
            stackId,
            agentId: opts.agent,
            sessionKey: opts.session,
          });
          console.log(JSON.stringify({ ok: true, state }, null, 2));
        });
    },
    { commands: ["sillyclaw"] },
  );
}

function toEntrySummary(entry: {
  key: string;
  name: string;
  role: string;
  contentTemplate: string;
  insertion: { kind: string; depth?: number; order?: number };
  historySegment: string;
  anchorBinding?: string;
  previousAnchorBinding?: string;
  nextAnchorBinding?: string;
}): Record<string, unknown> {
  return {
    key: entry.key,
    name: entry.name,
    role: entry.role,
    chars: entry.contentTemplate.length,
    insertion: entry.insertion,
    historySegment: entry.historySegment,
    anchorBinding: entry.anchorBinding,
    previousAnchorBinding: entry.previousAnchorBinding,
    nextAnchorBinding: entry.nextAnchorBinding,
  };
}

function toInstructionSummary(instruction: {
  entryKeys: string[];
  role: string;
  content: string;
}): Record<string, unknown> {
  return {
    entryKeys: instruction.entryKeys,
    role: instruction.role,
    chars: instruction.content.length,
  };
}
