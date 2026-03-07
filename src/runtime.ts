import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { compileStackToPromptInjection } from "./compile.js";
import { importSillyTavernPreset } from "./import/sillytavern.js";
import { SillyClawStore } from "./store.js";
import type {
  MacroMapping,
  PresetBlockTarget,
  PresetLayer,
  PresetStack,
  PromptInjection,
  SillyClawConfig,
  SillyClawState,
} from "./types.js";

export type SillyClawRuntime = {
  store: SillyClawStore;
  loadState: () => Promise<SillyClawState>;
  loadPreset: (id: string) => Promise<PresetLayer>;
  loadStack: (id: string) => Promise<PresetStack>;
  buildPromptInjection: (ctx: { agentId?: string; sessionKey?: string }) => Promise<PromptInjection>;
  inspectStack: (params: { stackId: string }) => Promise<{
    stack: PresetStack;
    layers: PresetLayer[];
    injectionSizes: { prependSystemContext: number; prependContext: number };
    missingMacros: Array<keyof MacroMapping>;
  }>;

  importSillyTavernFromFile: (params: {
    filePath: string;
    name?: string;
    mainTarget?: PresetBlockTarget;
  }) => Promise<PresetLayer>;

  listPresets: () => Promise<PresetLayer[]>;
  listStacks: () => Promise<PresetStack[]>;

  createStack: (params: { name: string; layers: string[] }) => Promise<PresetStack>;
  updateStack: (params: { stackId: string; name?: string; layers?: string[] }) => Promise<PresetStack>;
  deleteStack: (params: { stackId: string }) => Promise<void>;
  useStack: (params: { stackId: string; agentId?: string; sessionKey?: string }) => Promise<SillyClawState>;
  setStackMacros: (params: { stackId: string; macros: MacroMapping }) => Promise<PresetStack>;
};

export function createSillyClawRuntime(params: {
  api: OpenClawPluginApi;
  config: SillyClawConfig;
}): SillyClawRuntime {
  const store = new SillyClawStore({ dataDir: params.config.dataDir });

  async function loadState(): Promise<SillyClawState> {
    return await store.loadState();
  }

  async function loadPreset(id: string): Promise<PresetLayer> {
    return await store.loadPreset(id);
  }

  async function loadStack(id: string): Promise<PresetStack> {
    return await store.loadStack(id);
  }

  async function buildPromptInjection(ctx: { agentId?: string; sessionKey?: string }): Promise<PromptInjection> {
    const state = await store.loadState();
    const stackId = resolveActiveStackId({ state, agentId: ctx.agentId, sessionKey: ctx.sessionKey });
    if (!stackId) {
      return {};
    }

    const stack = await store.loadStack(stackId);
    const layers = await Promise.all(stack.layers.map((id) => store.loadPreset(id)));

    const result = compileStackToPromptInjection({ stack, layers });
    if (params.config.debug) {
      params.api.logger.debug(
        [
          `SillyClaw: stack=${stackId}`,
          `prependSystemContext=${result.injection.prependSystemContext?.length ?? 0} chars`,
          `prependContext=${result.injection.prependContext?.length ?? 0} chars`,
        ].join(" "),
      );
    }

    if (result.missingMacros.length > 0) {
      params.api.logger.warn(
        `SillyClaw: missing macro mappings (${result.missingMacros.join(", ")}). ` +
          `Set them with: openclaw sillyclaw stacks set-macros ${stackId} --char "..." --user "..."`,
      );
    }

    return result.injection;
  }

  async function inspectStack(p: { stackId: string }): Promise<{
    stack: PresetStack;
    layers: PresetLayer[];
    injectionSizes: { prependSystemContext: number; prependContext: number };
    missingMacros: Array<keyof MacroMapping>;
  }> {
    const stack = await store.loadStack(p.stackId);
    const layers = await Promise.all(stack.layers.map((id) => store.loadPreset(id)));
    const compiled = compileStackToPromptInjection({ stack, layers });
    return {
      stack,
      layers,
      injectionSizes: {
        prependSystemContext: compiled.injection.prependSystemContext?.length ?? 0,
        prependContext: compiled.injection.prependContext?.length ?? 0,
      },
      missingMacros: compiled.missingMacros,
    };
  }

  async function importSillyTavernFromFile(p: {
    filePath: string;
    name?: string;
    mainTarget?: PresetBlockTarget;
  }): Promise<PresetLayer> {
    const absPath = path.resolve(p.filePath);
    const rawText = await fs.readFile(absPath, "utf-8");
    const rawJson = JSON.parse(rawText) as unknown;
    const fileHashSha256 = createHash("sha256").update(rawText, "utf-8").digest("hex");

    const preset = importSillyTavernPreset({
      raw: rawJson,
      name: p.name ?? path.parse(absPath).name,
      sourceFileName: path.basename(absPath),
      sourceFileHashSha256: fileHashSha256,
      mainTarget: p.mainTarget,
    });

    await store.savePreset(preset);
    return preset;
  }

  async function listPresets(): Promise<PresetLayer[]> {
    return await store.listPresets();
  }

  async function listStacks(): Promise<PresetStack[]> {
    return await store.listStacks();
  }

  async function createStack(p: { name: string; layers: string[] }): Promise<PresetStack> {
    const stack: PresetStack = { schemaVersion: 1, id: randomUUID(), name: p.name, layers: p.layers };
    await store.saveStack(stack);
    return stack;
  }

  async function updateStack(p: { stackId: string; name?: string; layers?: string[] }): Promise<PresetStack> {
    const stack = await store.loadStack(p.stackId);
    if (p.name !== undefined) {
      stack.name = p.name;
    }
    if (p.layers !== undefined) {
      stack.layers = p.layers;
    }
    await store.saveStack(stack);
    return stack;
  }

  async function deleteStack(p: { stackId: string }): Promise<void> {
    await store.deleteStack(p.stackId);

    const state = await store.loadState();
    let changed = false;

    if (state.defaultStackId === p.stackId) {
      delete state.defaultStackId;
      changed = true;
    }

    if (state.stackByAgentId) {
      const before = Object.keys(state.stackByAgentId).length;
      state.stackByAgentId = Object.fromEntries(
        Object.entries(state.stackByAgentId).filter(([, v]) => v !== p.stackId),
      );
      changed = changed || Object.keys(state.stackByAgentId).length !== before;
    }

    if (state.stackBySessionKey) {
      const before = Object.keys(state.stackBySessionKey).length;
      state.stackBySessionKey = Object.fromEntries(
        Object.entries(state.stackBySessionKey).filter(([, v]) => v !== p.stackId),
      );
      changed = changed || Object.keys(state.stackBySessionKey).length !== before;
    }

    if (changed) {
      await store.saveState(state);
    }
  }

  async function useStack(p: { stackId: string; agentId?: string; sessionKey?: string }): Promise<SillyClawState> {
    const state = await store.loadState();
    if (p.sessionKey) {
      state.stackBySessionKey ??= {};
      state.stackBySessionKey[p.sessionKey] = p.stackId;
    } else if (p.agentId) {
      state.stackByAgentId ??= {};
      state.stackByAgentId[p.agentId] = p.stackId;
    } else {
      state.defaultStackId = p.stackId;
    }
    await store.saveState(state);
    return state;
  }

  async function setStackMacros(p: { stackId: string; macros: MacroMapping }): Promise<PresetStack> {
    const stack = await store.loadStack(p.stackId);
    stack.macros = { ...(stack.macros ?? {}), ...p.macros };
    await store.saveStack(stack);
    return stack;
  }

  return {
    store,
    loadState,
    loadPreset,
    loadStack,
    buildPromptInjection,
    inspectStack,
    importSillyTavernFromFile,
    listPresets,
    listStacks,
    createStack,
    updateStack,
    deleteStack,
    useStack,
    setStackMacros,
  };
}

function resolveActiveStackId(params: {
  state: SillyClawState;
  agentId?: string;
  sessionKey?: string;
}): string | undefined {
  const perSession = params.sessionKey ? params.state.stackBySessionKey?.[params.sessionKey] : undefined;
  const perAgent = params.agentId ? params.state.stackByAgentId?.[params.agentId] : undefined;
  return perSession ?? perAgent ?? params.state.defaultStackId;
}
