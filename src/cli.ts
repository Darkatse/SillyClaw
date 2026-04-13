import fs from "node:fs/promises";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { SillyClawV2Runtime } from "./v2/runtime.js";

type RegexRuleSummaryShape = {
  id: string;
  name: string;
  placements: string[];
  disabled?: boolean;
  minDepth?: number;
  maxDepth?: number;
};

type RegexRuleDetailShape = RegexRuleSummaryShape & {
  findRegex: string;
  replaceString: string;
};

type RegexLayerSummaryShape = {
  id: string;
  name: string;
  regexRules: RegexRuleSummaryShape[];
};

type RegexLayerDetailShape = {
  id: string;
  name: string;
  regexSource?: unknown;
  regexRules: RegexRuleDetailShape[];
};

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
        .option("--with-regex", "Import supported SillyTavern prompt regex rules")
        .action(async (file: string, opts: { name?: string; withRegex?: boolean }) => {
          const bundle = await params.runtime.importSillyTavernFromFile({
            filePath: file,
            name: opts.name,
            withRegex: opts.withRegex,
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
                  regex: {
                    source: bundle.layer.regexSource,
                    totalRules: bundle.layer.regexRules.length,
                    enabledRules: bundle.layer.regexRules.filter((rule) => !rule.disabled).length,
                    import: bundle.regexImport,
                  },
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
                regexSource: layer.regexSource,
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
                regex: {
                  totalRules: layer.regexRules.length,
                  enabledRules: layer.regexRules.filter((rule) => !rule.disabled).length,
                  rules: layer.regexRules.map((rule, index) => toRegexRuleSummary(layer, rule.id, index)),
                },
                featureSummary: layer.featureSummary,
                diagnostics: layer.diagnostics,
              },
              null,
              2,
            ),
          );
        });

      const layerScopes = layers.command("scopes").description("Inspect or modify preserved prompt-order scopes");
      layerScopes
        .command("list")
        .argument("<layerId>", "Stored v2 layer id")
        .action(async (layerId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(
            JSON.stringify(
              layer.scopes.map((scope) => ({
                id: scope.id,
                name: scope.name,
                sourceScope: scope.sourceScope,
                preferredRenderer: scope.preferredRenderer,
                entries: scope.entries.length,
                enabledEntries: scope.entries.filter((entry) => entry.enabled).length,
              })),
              null,
              2,
            ),
          );
        });

      layerScopes
        .command("show")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<scopeId>", "Preserved scope id")
        .action(async (layerId: string, scopeId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(JSON.stringify(toScopeSummary(layer, scopeId), null, 2));
        });

      layerScopes
        .command("enable")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<scopeId>", "Preserved scope id")
        .argument("<fragmentId>", "Fragment id to enable inside the scope")
        .action(async (layerId: string, scopeId: string, fragmentId: string) => {
          const result = await params.runtime.setLayerScopeEntryEnabled({
            layerId,
            scopeId,
            fragmentId,
            enabled: true,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                scope: toScopeSummary(result.layer, result.scope.id),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
              },
              null,
              2,
            ),
          );
        });

      layerScopes
        .command("disable")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<scopeId>", "Preserved scope id")
        .argument("<fragmentId>", "Fragment id to disable inside the scope")
        .action(async (layerId: string, scopeId: string, fragmentId: string) => {
          const result = await params.runtime.setLayerScopeEntryEnabled({
            layerId,
            scopeId,
            fragmentId,
            enabled: false,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                scope: toScopeSummary(result.layer, result.scope.id),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
              },
              null,
              2,
            ),
          );
        });

      layerScopes
        .command("move")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<scopeId>", "Preserved scope id")
        .argument("<fragmentId>", "Fragment id to move inside the scope")
        .option("--before <fragmentId>", "Insert before another fragment id")
        .option("--after <fragmentId>", "Insert after another fragment id")
        .action(
          async (
            layerId: string,
            scopeId: string,
            fragmentId: string,
            opts: { before?: string; after?: string },
          ) => {
            const result = await params.runtime.moveLayerScopeEntry({
              layerId,
              scopeId,
              fragmentId,
              beforeFragmentId: opts.before,
              afterFragmentId: opts.after,
            });
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  scope: toScopeSummary(result.layer, result.scope.id),
                  affectedStackIds: result.affectedStackIds,
                  updatedStacks: result.updatedStacks.map(toStackSummary),
                },
                null,
                2,
              ),
            );
          },
        );

      const layerFragments = layers.command("fragments").description("Inspect or modify stored prompt fragments");
      layerFragments
        .command("list")
        .argument("<layerId>", "Stored v2 layer id")
        .action(async (layerId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(JSON.stringify(layer.fragments.map((fragment) => toFragmentSummary(layer, fragment.id)), null, 2));
        });

      layerFragments
        .command("show")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<fragmentId>", "Stored fragment id")
        .action(async (layerId: string, fragmentId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(JSON.stringify(toFragmentDetail(layer, fragmentId), null, 2));
        });

      layerFragments
        .command("set-content")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<fragmentId>", "Stored fragment id")
        .option("--text <text>", "Set content from a literal string")
        .option("--file <path>", "Set content from a UTF-8 text file")
        .option("--stdin", "Read content from stdin")
        .action(
          async (
            layerId: string,
            fragmentId: string,
            opts: { text?: string; file?: string; stdin?: boolean },
          ) => {
            const content = await readContentInput(opts);
            const result = await params.runtime.setLayerFragmentContent({
              layerId,
              fragmentId,
              content,
            });
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  fragment: toFragmentSummary(result.layer, result.fragment.id),
                  affectedStackIds: result.affectedStackIds,
                  updatedStacks: result.updatedStacks.map(toStackSummary),
                },
                null,
                2,
              ),
            );
          },
        );

      layerFragments
        .command("set-insertion")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<fragmentId>", "Stored fragment id")
        .option("--relative", "Use relative placement")
        .option("--absolute", "Use absolute placement")
        .option("--depth <depth>", "Absolute depth")
        .option("--order <order>", "Absolute insertion order")
        .action(
          async (
            layerId: string,
            fragmentId: string,
            opts: { relative?: boolean; absolute?: boolean; depth?: string; order?: string },
          ) => {
            const insertion = parseInsertionOptions(opts);
            const result = await params.runtime.setLayerFragmentInsertion({
              layerId,
              fragmentId,
              insertion,
            });
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  fragment: toFragmentSummary(result.layer, result.fragment.id),
                  affectedStackIds: result.affectedStackIds,
                  updatedStacks: result.updatedStacks.map(toStackSummary),
                },
                null,
                2,
              ),
            );
          },
        );

      const layerRegex = layers.command("regex").description("Inspect or modify stored regex rules");
      layerRegex
        .command("list")
        .argument("<layerId>", "Stored v2 layer id")
        .action(async (layerId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(JSON.stringify(layer.regexRules.map((rule, index) => toRegexRuleSummary(layer, rule.id, index)), null, 2));
        });

      layerRegex
        .command("show")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<ruleId>", "Stored regex rule id")
        .action(async (layerId: string, ruleId: string) => {
          const layer = await params.runtime.loadLayer(layerId);
          console.log(JSON.stringify(toRegexRuleDetail(layer, ruleId), null, 2));
        });

      layerRegex
        .command("import")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<file>", "Path to a SillyTavern preset JSON file")
        .action(async (layerId: string, file: string) => {
          const result = await params.runtime.replaceLayerRegexFromFile({
            layerId,
            filePath: file,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                regexSource: result.regexSource,
                regexImport: result.regexImport,
                rules: result.layer.regexRules.map((rule, index) => toRegexRuleSummary(result.layer, rule.id, index)),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
              },
              null,
              2,
            ),
          );
        });

      layerRegex
        .command("enable")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<ruleId>", "Stored regex rule id")
        .action(async (layerId: string, ruleId: string) => {
          const result = await params.runtime.setLayerRegexRuleEnabled({
            layerId,
            ruleId,
            enabled: true,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                rule: toRegexRuleDetail(result.layer, result.rule.id),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
              },
              null,
              2,
            ),
          );
        });

      layerRegex
        .command("disable")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<ruleId>", "Stored regex rule id")
        .action(async (layerId: string, ruleId: string) => {
          const result = await params.runtime.setLayerRegexRuleEnabled({
            layerId,
            ruleId,
            enabled: false,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                rule: toRegexRuleDetail(result.layer, result.rule.id),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
              },
              null,
              2,
            ),
          );
        });

      layerRegex
        .command("move")
        .argument("<layerId>", "Stored v2 layer id")
        .argument("<ruleId>", "Stored regex rule id")
        .option("--before <ruleId>", "Insert before another regex rule id")
        .option("--after <ruleId>", "Insert after another regex rule id")
        .action(async (layerId: string, ruleId: string, opts: { before?: string; after?: string }) => {
          const result = await params.runtime.moveLayerRegexRule({
            layerId,
            ruleId,
            beforeRuleId: opts.before,
            afterRuleId: opts.after,
          });
          console.log(
            JSON.stringify(
              {
                ok: true,
                rule: toRegexRuleDetail(result.layer, result.rule.id),
                rules: result.layer.regexRules.map((rule, index) => toRegexRuleSummary(result.layer, rule.id, index)),
                affectedStackIds: result.affectedStackIds,
                updatedStacks: result.updatedStacks.map(toStackSummary),
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
                regexArtifact: {
                  count: result.regexRuleCount,
                  rules:
                    result.artifact.regexArtifact?.rules.map((rule) => ({
                      key: rule.key,
                      layerId: rule.layerId,
                      ruleId: rule.ruleId,
                      name: rule.name,
                      placements: rule.placements,
                      minDepth: rule.minDepth,
                      maxDepth: rule.maxDepth,
                    })) ?? [],
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

function toScopeSummary(
  layer: {
    id: string;
    name: string;
    scopes: Array<{
      id: string;
      name: string;
      sourceScope: unknown;
      preferredRenderer: string;
      entries: Array<{ fragmentId: string; enabled: boolean; ordinal: number }>;
    }>;
    fragments: Array<{
      id: string;
      name: string;
      role: string;
      marker: boolean;
      systemPrompt: boolean;
      anchorBinding?: string;
      insertion: { kind: string; depth?: number; order?: number };
      featureFlags: string[];
      contentTemplate: string;
    }>;
  },
  scopeId: string,
): Record<string, unknown> {
  const scope = requireScope(layer, scopeId);
  const fragmentsById = new Map(layer.fragments.map((fragment) => [fragment.id, fragment]));
  return {
    layerId: layer.id,
    layerName: layer.name,
    id: scope.id,
    name: scope.name,
    sourceScope: scope.sourceScope,
    preferredRenderer: scope.preferredRenderer,
    entries: scope.entries
      .slice()
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((entry) => {
        const fragment = fragmentsById.get(entry.fragmentId);
        if (!fragment) {
          throw new Error(`SillyClaw CLI: missing fragment for scope entry: ${scope.id}:${entry.fragmentId}`);
        }
        return {
          fragmentId: entry.fragmentId,
          enabled: entry.enabled,
          ordinal: entry.ordinal,
          name: fragment.name,
          role: fragment.role,
          marker: fragment.marker,
          systemPrompt: fragment.systemPrompt,
          anchorBinding: fragment.anchorBinding,
          insertion: fragment.insertion,
          featureFlags: fragment.featureFlags,
          chars: fragment.contentTemplate.length,
        };
      }),
  };
}

function toFragmentSummary(
  layer: {
    id: string;
    name: string;
    scopes: Array<{
      id: string;
      entries: Array<{ fragmentId: string; enabled: boolean; ordinal: number }>;
    }>;
    fragments: Array<{
      id: string;
      name: string;
      role: string;
      marker: boolean;
      systemPrompt: boolean;
      anchorBinding?: string;
      triggerPolicy: string[];
      insertion: { kind: string; depth?: number; order?: number };
      forbidOverrides: boolean;
      featureFlags: string[];
      contentTemplate: string;
    }>;
  },
  fragmentId: string,
): Record<string, unknown> {
  const fragment = requireFragment(layer, fragmentId);
  return {
    layerId: layer.id,
    layerName: layer.name,
    id: fragment.id,
    name: fragment.name,
    role: fragment.role,
    marker: fragment.marker,
    systemPrompt: fragment.systemPrompt,
    anchorBinding: fragment.anchorBinding,
    triggerPolicy: fragment.triggerPolicy,
    insertion: fragment.insertion,
    forbidOverrides: fragment.forbidOverrides,
    featureFlags: fragment.featureFlags,
    chars: fragment.contentTemplate.length,
    referencedBy: layer.scopes
      .filter((scope) => scope.entries.some((entry) => entry.fragmentId === fragment.id))
      .map((scope) => {
        const entry = scope.entries.find((candidate) => candidate.fragmentId === fragment.id);
        if (!entry) {
          throw new Error(`SillyClaw CLI: missing scope entry after reference match: ${scope.id}:${fragment.id}`);
        }
        return {
          scopeId: scope.id,
          enabled: entry.enabled,
          ordinal: entry.ordinal,
        };
      }),
  };
}

function toFragmentDetail(
  layer: Parameters<typeof toFragmentSummary>[0],
  fragmentId: string,
): Record<string, unknown> {
  const fragment = requireFragment(layer, fragmentId);
  return {
    ...toFragmentSummary(layer, fragmentId),
    contentTemplate: fragment.contentTemplate,
  };
}

function toStackSummary(stack: { id: string; name: string; preferredRenderer: string }): Record<string, unknown> {
  return {
    id: stack.id,
    name: stack.name,
    preferredRenderer: stack.preferredRenderer,
  };
}

function toRegexRuleSummary(
  layer: RegexLayerSummaryShape,
  ruleId: string,
  index?: number,
): Record<string, unknown> {
  const rule = requireRegexRule(layer, ruleId);
  const order = index ?? layer.regexRules.findIndex((candidate) => candidate.id === rule.id);
  return {
    layerId: layer.id,
    layerName: layer.name,
    id: rule.id,
    name: rule.name,
    order,
    enabled: !rule.disabled,
    placements: rule.placements,
    minDepth: rule.minDepth,
    maxDepth: rule.maxDepth,
  };
}

function toRegexRuleDetail(
  layer: RegexLayerDetailShape,
  ruleId: string,
): Record<string, unknown> {
  const rule = requireRegexRuleDetail(layer, ruleId);
  return {
    ...toRegexRuleSummary(layer, ruleId),
    regexSource: layer.regexSource,
    findRegex: rule.findRegex,
    replaceString: rule.replaceString,
  };
}

function requireScope(
  layer: Parameters<typeof toScopeSummary>[0],
  scopeId: string,
): Parameters<typeof toScopeSummary>[0]["scopes"][number] {
  const scope = layer.scopes.find((candidate) => candidate.id === scopeId);
  if (!scope) {
    throw new Error(`SillyClaw CLI: missing scope: ${layer.id}:${scopeId}`);
  }
  return scope;
}

function requireFragment(
  layer: Parameters<typeof toFragmentSummary>[0],
  fragmentId: string,
): Parameters<typeof toFragmentSummary>[0]["fragments"][number] {
  const fragment = layer.fragments.find((candidate) => candidate.id === fragmentId);
  if (!fragment) {
    throw new Error(`SillyClaw CLI: missing fragment: ${layer.id}:${fragmentId}`);
  }
  return fragment;
}

function requireRegexRule(
  layer: RegexLayerSummaryShape,
  ruleId: string,
): RegexRuleSummaryShape {
  const rule = layer.regexRules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new Error(`SillyClaw CLI: missing regex rule: ${layer.id}:${ruleId}`);
  }
  return rule;
}

function requireRegexRuleDetail(
  layer: RegexLayerDetailShape,
  ruleId: string,
): RegexRuleDetailShape {
  const rule = layer.regexRules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new Error(`SillyClaw CLI: missing regex rule: ${layer.id}:${ruleId}`);
  }
  return rule;
}

async function readContentInput(opts: {
  text?: string;
  file?: string;
  stdin?: boolean;
}): Promise<string> {
  const sourceCount = Number(opts.text !== undefined) + Number(opts.file !== undefined) + Number(opts.stdin === true);
  if (sourceCount !== 1) {
    throw new Error("Use exactly one content source: --text, --file, or --stdin.");
  }

  if (opts.text !== undefined) {
    return opts.text;
  }
  if (opts.file !== undefined) {
    return await fs.readFile(opts.file, "utf-8");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseInsertionOptions(opts: {
  relative?: boolean;
  absolute?: boolean;
  depth?: string;
  order?: string;
}): { kind: "relative" } | { kind: "absolute"; depth: number; order: number } {
  if (opts.relative === opts.absolute) {
    throw new Error("Use exactly one insertion mode: --relative or --absolute.");
  }

  if (opts.relative) {
    if (opts.depth !== undefined || opts.order !== undefined) {
      throw new Error("Relative insertion does not accept --depth or --order.");
    }
    return { kind: "relative" };
  }

  if (opts.depth === undefined || opts.order === undefined) {
    throw new Error("Absolute insertion requires both --depth and --order.");
  }

  return {
    kind: "absolute",
    depth: parseIntegerOption(opts.depth, "depth"),
    order: parseIntegerOption(opts.order, "order"),
  };
}

function parseIntegerOption(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected ${label} to be an integer, received: ${value}`);
  }
  return parsed;
}
