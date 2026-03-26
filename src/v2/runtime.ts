import type { AgentMessage } from "@mariozechner/pi-agent-core";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sha256OfJson } from "../io.js";
import type {
  DiagnosticCodeV2,
  HookPromptInjectionV2,
  ImportedPresetBundleV2,
  ImportDiagnosticV2,
  LayerIndexEntryV2,
  PlacementSummaryV2,
  PlanDiagnosticV2,
  PresetLayerV2,
  RenderPlanV2,
  SillyClawStateV2,
  StackArtifactV2,
  StackIndexEntryV2,
  StackV2,
} from "./model.js";
import { SILLYCLAW_V2_SCHEMA_VERSION } from "./model.js";
import { importSillyTavernPresetV2 } from "./import/sillytavern.js";
import { summarizePlacementV2 } from "./observability.js";
import { planStackRenderV2, SILLYCLAW_V2_PLANNER_VERSION } from "./planner.js";
import {
  SILLYCLAW_V2_CONTEXT_ENGINE_RENDERER_VERSION,
  assembleContextEngineMessagesV2,
  renderContextEngineArtifactV2,
} from "./render-context-engine.js";
import {
  SILLYCLAW_V2_HOOK_RENDERER_VERSION,
  renderHookArtifactV2,
} from "./render-hooks.js";
import { SillyClawV2Store } from "./store.js";

type RuntimeLogger = {
  debug?: (message: string) => void;
};

type ActiveSelectionScopeV2 = "none" | "session" | "agent" | "default";

const SILLYCLAW_V2_RENDERER_VERSION =
  `${SILLYCLAW_V2_HOOK_RENDERER_VERSION}:${SILLYCLAW_V2_CONTEXT_ENGINE_RENDERER_VERSION}`;

type StackInspectionV2 = {
  stack: StackV2;
  layers: PresetLayerV2[];
  plan: RenderPlanV2;
  artifact: StackArtifactV2;
  placementSummary: PlacementSummaryV2;
  importDiagnostics: Array<ImportDiagnosticV2 & { layerId: string; layerName: string }>;
  planDiagnostics: PlanDiagnosticV2[];
  diagnosticsSummary: DiagnosticCodeV2[];
  injectionSizes: {
    prependSystemContext: number;
    appendSystemContext: number;
    prependContext: number;
  };
};

type ActiveInspectionV2 =
  | { scope: "none" }
  | {
      scope: Exclude<ActiveSelectionScopeV2, "none">;
      stackId: string;
      stackName: string;
      preferredRenderer: StackV2["preferredRenderer"];
      artifactKey: string;
      cacheSource: "artifact" | "compile";
      placementSummary: PlacementSummaryV2;
      diagnosticsSummary: DiagnosticCodeV2[];
      injectionSizes: {
        prependSystemContext: number;
        appendSystemContext: number;
        prependContext: number;
      };
    };

type CacheStatsV2 = {
  layers: number;
  stacks: number;
  selections: {
    defaultStackId?: string;
    agents: number;
    sessions: number;
  };
  artifacts: {
    stored: number;
    tracked: number;
    warm: number;
    stale: number;
    cold: number;
    orphaned: number;
  };
};

export type SillyClawV2Runtime = {
  store: SillyClawV2Store;
  loadState: () => Promise<SillyClawStateV2>;
  importSillyTavernFromFile: (params: { filePath: string; name?: string; layerId?: string }) => Promise<ImportedPresetBundleV2>;
  listLayerIndex: () => Promise<LayerIndexEntryV2[]>;
  listStackIndex: () => Promise<StackIndexEntryV2[]>;
  loadLayer: (id: string) => Promise<PresetLayerV2>;
  loadStack: (id: string) => Promise<StackV2>;
  useStack: (params: { stackId: string; agentId?: string; sessionKey?: string }) => Promise<SillyClawStateV2>;
  buildPromptInjection: (ctx: {
    agentId?: string;
    sessionKey?: string;
    allowAgentFallback?: boolean;
  }) => Promise<HookPromptInjectionV2>;
  buildContextMessages: (ctx: {
    sessionKey?: string;
    messages: AgentMessage[];
  }) => Promise<AgentMessage[]>;
  inspectStack: (params: { stackId: string }) => Promise<StackInspectionV2>;
  inspectActive: (ctx: { agentId?: string; sessionKey?: string }) => Promise<ActiveInspectionV2>;
  inspectCache: () => Promise<CacheStatsV2>;
};

export function createSillyClawV2Runtime(params: {
  dataDir: string;
  debug?: boolean;
  logger?: RuntimeLogger;
}): SillyClawV2Runtime {
  const store = new SillyClawV2Store({ dataDir: params.dataDir });

  async function loadState(): Promise<SillyClawStateV2> {
    return await store.loadState();
  }

  async function importSillyTavernFromFile(p: {
    filePath: string;
    name?: string;
    layerId?: string;
  }): Promise<ImportedPresetBundleV2> {
    const absPath = path.resolve(p.filePath);
    const rawText = await fs.readFile(absPath, "utf-8");
    const fileHashSha256 = createHash("sha256").update(rawText, "utf-8").digest("hex");

    const bundle = importSillyTavernPresetV2({
      raw: JSON.parse(rawText) as unknown,
      layerId: p.layerId,
      name: p.name ?? path.parse(absPath).name,
      sourceFileName: path.basename(absPath),
      sourceFileHashSha256: fileHashSha256,
    });

    await store.saveImportedBundle(bundle);
    return bundle;
  }

  async function listLayerIndex(): Promise<LayerIndexEntryV2[]> {
    return await store.listLayerIndex();
  }

  async function listStackIndex(): Promise<StackIndexEntryV2[]> {
    return await store.listStackIndex();
  }

  async function loadLayer(id: string): Promise<PresetLayerV2> {
    return await store.loadLayer(id);
  }

  async function loadStack(id: string): Promise<StackV2> {
    return await store.loadStack(id);
  }

  async function useStack(p: { stackId: string; agentId?: string; sessionKey?: string }): Promise<SillyClawStateV2> {
    await store.loadStack(p.stackId);

    const state = await store.loadState();
    if (p.sessionKey) {
      state.stackBySessionKey[p.sessionKey] = p.stackId;
    } else if (p.agentId) {
      state.stackByAgentId[p.agentId] = p.stackId;
    } else {
      state.defaultStackId = p.stackId;
    }
    await store.saveState(state);
    return state;
  }

  async function buildPromptInjection(ctx: {
    agentId?: string;
    sessionKey?: string;
    allowAgentFallback?: boolean;
  }): Promise<HookPromptInjectionV2> {
    const resolved = await resolveActiveArtifact({
      store,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      allowAgentFallback: ctx.allowAgentFallback,
    });
    if (!resolved) {
      return {};
    }

    if (resolved.artifact.hookArtifact) {
      logBuild(params, {
        scope: resolved.scope,
        stackId: resolved.stackId,
        artifact: resolved.artifact,
        source: resolved.source,
      });
      return resolved.artifact.hookArtifact.injection;
    }

    return {};
  }

  async function buildContextMessages(ctx: {
    sessionKey?: string;
    messages: AgentMessage[];
  }): Promise<AgentMessage[]> {
    const resolved = await resolveActiveArtifact({
      store,
      sessionKey: ctx.sessionKey,
      allowAgentFallback: false,
    });
    if (!resolved?.artifact.engineArtifact) {
      return ctx.messages;
    }

    return assembleContextEngineMessagesV2({
      artifact: resolved.artifact.engineArtifact,
      messages: ctx.messages,
    });
  }

  async function inspectStack(p: { stackId: string }): Promise<StackInspectionV2> {
    const compiled = await compileStack({
      store,
      stackId: p.stackId,
    });
    return {
      stack: compiled.stack,
      layers: compiled.layers,
      plan: compiled.plan,
      artifact: compiled.artifact,
      placementSummary: summarizePlacementV2(compiled.artifact),
      importDiagnostics: flattenImportDiagnostics(compiled.layers),
      planDiagnostics: compiled.plan.diagnostics,
      diagnosticsSummary: compiled.diagnosticsSummary,
      injectionSizes: resolveInjectionSizes(compiled.artifact.hookArtifact?.injection),
    };
  }

  async function inspectActive(ctx: { agentId?: string; sessionKey?: string }): Promise<ActiveInspectionV2> {
    const selection = await resolveActiveSelection({
      store,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
    });
    if (!selection.stackId || selection.scope === "none") {
      return { scope: "none" } as const;
    }

    const warmArtifact = await loadWarmArtifact(store, selection.stackId);
    if (warmArtifact) {
      return {
        scope: selection.scope,
        stackId: selection.stackId,
        stackName: warmArtifact.indexEntry.name,
        preferredRenderer: warmArtifact.indexEntry.preferredRenderer,
        artifactKey: warmArtifact.artifact.key,
        cacheSource: "artifact",
        placementSummary: warmArtifact.indexEntry.placementSummary ?? summarizePlacementV2(warmArtifact.artifact),
        diagnosticsSummary: warmArtifact.artifact.diagnosticsSummary,
        injectionSizes: resolveInjectionSizes(warmArtifact.artifact.hookArtifact?.injection),
      } as const;
    }

    const compiled = await compileStack({
      store,
      stackId: selection.stackId,
    });
    return {
      scope: selection.scope,
      stackId: compiled.stack.id,
      stackName: compiled.stack.name,
      preferredRenderer: compiled.stack.preferredRenderer,
      artifactKey: compiled.artifact.key,
      cacheSource: "compile",
      placementSummary: summarizePlacementV2(compiled.artifact),
      diagnosticsSummary: compiled.diagnosticsSummary,
      injectionSizes: resolveInjectionSizes(compiled.artifact.hookArtifact?.injection),
    } as const;
  }

  async function inspectCache(): Promise<CacheStatsV2> {
    const [state, layerIndex, stackIndex, artifactKeys] = await Promise.all([
      store.loadState(),
      store.listLayerIndex(),
      store.listStackIndex(),
      store.listArtifactKeys(),
    ]);

    const trackedEntries = stackIndex.filter((entry) => entry.artifactKey !== undefined);
    const trackedKeys = new Set(trackedEntries.map((entry) => entry.artifactKey!));
    const artifactState = await Promise.all(
      trackedEntries.map(async (entry) => {
        try {
          const artifact = await store.loadArtifact(entry.artifactKey!);
          return isCurrentArtifact(entry, artifact) ? "warm" : "stale";
        } catch {
          return "stale" as const;
        }
      }),
    );

    const warm = artifactState.filter((state) => state === "warm").length;
    const stale = artifactState.length - warm;
    return {
      layers: layerIndex.length,
      stacks: stackIndex.length,
      selections: {
        defaultStackId: state.defaultStackId,
        agents: Object.keys(state.stackByAgentId).length,
        sessions: Object.keys(state.stackBySessionKey).length,
      },
      artifacts: {
        stored: artifactKeys.length,
        tracked: trackedEntries.length,
        warm,
        stale,
        cold: stackIndex.length - trackedEntries.length,
        orphaned: artifactKeys.filter((key) => !trackedKeys.has(key)).length,
      },
    };
  }

  return {
    store,
    loadState,
    importSillyTavernFromFile,
    listLayerIndex,
    listStackIndex,
    loadLayer,
    loadStack,
    useStack,
    buildPromptInjection,
    buildContextMessages,
    inspectStack,
    inspectActive,
    inspectCache,
  };
}

async function compileStack(params: {
  store: SillyClawV2Store;
  stackId: string;
}): Promise<{
  stack: StackV2;
  layers: PresetLayerV2[];
  plan: RenderPlanV2;
  artifact: StackArtifactV2;
  diagnosticsSummary: DiagnosticCodeV2[];
}> {
  const stack = await params.store.loadStack(params.stackId);
  const layers = await Promise.all(
    stack.layers.map((layerRef) => params.store.loadLayer(layerRef.layerId)),
  );
  const plan = planStackRenderV2({ stack, layers });
  const hookArtifact = renderHookArtifactV2(plan);
  const engineArtifact = renderContextEngineArtifactV2(plan);
  const diagnosticsSummary = summarizeDiagnostics(layers, plan);
  const artifact: StackArtifactV2 = {
    schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
    key: resolveArtifactKey({ stack, layers }),
    stackId: stack.id,
    plannerVersion: SILLYCLAW_V2_PLANNER_VERSION,
    rendererVersion: SILLYCLAW_V2_RENDERER_VERSION,
    createdAt: new Date().toISOString(),
    hookArtifact,
    engineArtifact,
    diagnosticsSummary,
  };

  await params.store.saveArtifact(artifact);
  return {
    stack,
    layers,
    plan,
    artifact,
    diagnosticsSummary,
  };
}

async function resolveActiveSelection(params: {
  store: SillyClawV2Store;
  agentId?: string;
  sessionKey?: string;
  allowAgentFallback?: boolean;
}): Promise<{ stackId?: string; scope: ActiveSelectionScopeV2 }> {
  const state = await params.store.loadState();
  const perSession = params.sessionKey ? state.stackBySessionKey[params.sessionKey] : undefined;
  if (perSession) {
    return { stackId: perSession, scope: "session" };
  }
  if (params.allowAgentFallback !== false) {
    const perAgent = params.agentId ? state.stackByAgentId[params.agentId] : undefined;
    if (perAgent) {
      return { stackId: perAgent, scope: "agent" };
    }
  }
  if (state.defaultStackId) {
    return { stackId: state.defaultStackId, scope: "default" };
  }
  return { scope: "none" };
}

async function resolveActiveArtifact(params: {
  store: SillyClawV2Store;
  agentId?: string;
  sessionKey?: string;
  allowAgentFallback?: boolean;
}): Promise<
  | {
      scope: Exclude<ActiveSelectionScopeV2, "none">;
      stackId: string;
      artifact: StackArtifactV2;
      source: "artifact" | "compile";
    }
  | undefined
> {
  const selection = await resolveActiveSelection(params);
  if (!selection.stackId || selection.scope === "none") {
    return undefined;
  }

  const warmArtifact = await loadWarmArtifact(params.store, selection.stackId);
  if (warmArtifact) {
    return {
      scope: selection.scope,
      stackId: selection.stackId,
      artifact: warmArtifact.artifact,
      source: "artifact",
    };
  }

  const compiled = await compileStack({
    store: params.store,
    stackId: selection.stackId,
  });
  return {
    scope: selection.scope,
    stackId: compiled.stack.id,
    artifact: compiled.artifact,
    source: "compile",
  };
}

async function loadWarmArtifact(
  store: SillyClawV2Store,
  stackId: string,
): Promise<
  | {
      indexEntry: StackIndexEntryV2;
      artifact: StackArtifactV2;
    }
  | undefined
> {
  const indexEntry = await store.loadStackIndexEntry(stackId);
  if (!indexEntry?.artifactKey) {
    return undefined;
  }

  let artifact: StackArtifactV2;
  try {
    artifact = await store.loadArtifact(indexEntry.artifactKey);
  } catch {
    return undefined;
  }
  if (!isCurrentArtifact(indexEntry, artifact)) {
    return undefined;
  }

  return {
    indexEntry,
    artifact,
  };
}

function summarizeDiagnostics(
  layers: PresetLayerV2[],
  plan: RenderPlanV2,
): DiagnosticCodeV2[] {
  return [...new Set([
    ...layers.flatMap((layer) => layer.diagnostics.map((diagnostic) => diagnostic.code)),
    ...plan.diagnostics.map((diagnostic) => diagnostic.code),
  ])];
}

function flattenImportDiagnostics(
  layers: PresetLayerV2[],
): Array<ImportDiagnosticV2 & { layerId: string; layerName: string }> {
  return layers.flatMap((layer) =>
    layer.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      layerId: layer.id,
      layerName: layer.name,
    })),
  );
}

function isCurrentArtifact(
  indexEntry: StackIndexEntryV2,
  artifact: StackArtifactV2,
): boolean {
  return (
    artifact.key === indexEntry.artifactKey &&
    artifact.stackId === indexEntry.id &&
    artifact.plannerVersion === SILLYCLAW_V2_PLANNER_VERSION &&
    artifact.rendererVersion === SILLYCLAW_V2_RENDERER_VERSION
  );
}

function resolveArtifactKey(params: {
  stack: StackV2;
  layers: PresetLayerV2[];
}): string {
  return sha256OfJson({
    plannerVersion: SILLYCLAW_V2_PLANNER_VERSION,
    rendererVersion: SILLYCLAW_V2_RENDERER_VERSION,
    stack: params.stack,
    layers: params.layers,
  });
}

function resolveInjectionSizes(injection?: HookPromptInjectionV2): {
  prependSystemContext: number;
  appendSystemContext: number;
  prependContext: number;
} {
  return {
    prependSystemContext: injection?.prependSystemContext?.length ?? 0,
    appendSystemContext: injection?.appendSystemContext?.length ?? 0,
    prependContext: injection?.prependContext?.length ?? 0,
  };
}

function logBuild(
  params: {
    debug?: boolean;
    logger?: RuntimeLogger;
  },
  event: {
    scope: ActiveSelectionScopeV2;
    stackId: string;
    artifact: StackArtifactV2;
    source: "artifact" | "compile";
  },
): void {
  if (!params.debug || !params.logger?.debug) {
    return;
  }

  const sizes = resolveInjectionSizes(event.artifact.hookArtifact?.injection);
  params.logger.debug(
    [
      `SillyClaw v2: stack=${event.stackId}`,
      `scope=${event.scope}`,
      `source=${event.source}`,
      `prependSystemContext=${sizes.prependSystemContext} chars`,
      `appendSystemContext=${sizes.appendSystemContext} chars`,
      `prependContext=${sizes.prependContext} chars`,
      `diagnostics=${event.artifact.diagnosticsSummary.join(",") || "none"}`,
    ].join(" "),
  );
}
