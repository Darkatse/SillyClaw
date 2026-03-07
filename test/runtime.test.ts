import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSillyClawRuntime } from "../src/runtime.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { PresetLayer, PresetStack, SillyClawState } from "../src/types.js";

function createTestApi(): {
  api: OpenClawPluginApi;
  logger: {
    debug: ReturnType<typeof vi.fn<(msg: string) => void>>;
    info: ReturnType<typeof vi.fn<(msg: string) => void>>;
    warn: ReturnType<typeof vi.fn<(msg: string) => void>>;
    error: ReturnType<typeof vi.fn<(msg: string) => void>>;
  };
} {
  const logger = {
    debug: vi.fn<(msg: string) => void>(),
    info: vi.fn<(msg: string) => void>(),
    warn: vi.fn<(msg: string) => void>(),
    error: vi.fn<(msg: string) => void>(),
  };

  const api: OpenClawPluginApi = {
    id: "test",
    config: {},
    logger,
    pluginConfig: {},
    resolvePath: (input: string) => input,
    on: () => {},
    registerCli: () => {},
  };

  return { api, logger };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sillyclaw-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("SillyClaw runtime", () => {
  it("resolves active stack with precedence session > agent > default", async () => {
    await withTempDir(async (dataDir) => {
      const { api } = createTestApi();
      const runtime = createSillyClawRuntime({ api, config: { dataDir, debug: false } });

      const presetDefault: PresetLayer = {
        schemaVersion: 1,
        id: "p-default",
        name: "Default",
        blocks: [{ target: "system.prepend", order: 0, text: "DEFAULT" }],
      };
      const presetAgent: PresetLayer = {
        schemaVersion: 1,
        id: "p-agent",
        name: "Agent",
        blocks: [{ target: "system.prepend", order: 0, text: "AGENT" }],
      };
      const presetSession: PresetLayer = {
        schemaVersion: 1,
        id: "p-session",
        name: "Session",
        blocks: [{ target: "system.prepend", order: 0, text: "SESSION" }],
      };

      const stackDefault: PresetStack = { schemaVersion: 1, id: "s-default", name: "SDefault", layers: [presetDefault.id] };
      const stackAgent: PresetStack = { schemaVersion: 1, id: "s-agent", name: "SAgent", layers: [presetAgent.id] };
      const stackSession: PresetStack = { schemaVersion: 1, id: "s-session", name: "SSession", layers: [presetSession.id] };

      await runtime.store.savePreset(presetDefault);
      await runtime.store.savePreset(presetAgent);
      await runtime.store.savePreset(presetSession);
      await runtime.store.saveStack(stackDefault);
      await runtime.store.saveStack(stackAgent);
      await runtime.store.saveStack(stackSession);

      const state: SillyClawState = {
        schemaVersion: 1,
        defaultStackId: stackDefault.id,
        stackByAgentId: { agentA: stackAgent.id },
        stackBySessionKey: { sessionX: stackSession.id },
      };
      await runtime.store.saveState(state);

      const injSession = await runtime.buildPromptInjection({ agentId: "agentA", sessionKey: "sessionX" });
      expect(injSession.prependSystemContext).toBe("SESSION");

      const injAgent = await runtime.buildPromptInjection({ agentId: "agentA" });
      expect(injAgent.prependSystemContext).toBe("AGENT");

      const injDefault = await runtime.buildPromptInjection({});
      expect(injDefault.prependSystemContext).toBe("DEFAULT");

      const active = await runtime.inspectActive({ agentId: "agentA", sessionKey: "sessionX" });
      expect(active).toMatchObject({
        scope: "session",
        stackId: "s-session",
        stackName: "SSession",
        injectionSizes: { prependSystemContext: 7, prependContext: 0 },
        missingMacros: [],
        layers: [{ id: "p-session", name: "Session", blocks: 1, enabledBlocks: 1 }],
      });
    });
  });

  it("deleteStack removes references from state (default/agent/session)", async () => {
    await withTempDir(async (dataDir) => {
      const { api } = createTestApi();
      const runtime = createSillyClawRuntime({ api, config: { dataDir, debug: false } });

      const preset: PresetLayer = {
        schemaVersion: 1,
        id: "p1",
        name: "P",
        blocks: [{ target: "system.prepend", order: 0, text: "X" }],
      };
      const stack: PresetStack = { schemaVersion: 1, id: "s1", name: "S", layers: [preset.id] };
      await runtime.store.savePreset(preset);
      await runtime.store.saveStack(stack);

      await runtime.store.saveState({
        schemaVersion: 1,
        defaultStackId: stack.id,
        stackByAgentId: { a: stack.id },
        stackBySessionKey: { s: stack.id },
      });

      await runtime.deleteStack({ stackId: stack.id });

      const state = await runtime.loadState();
      expect(state.defaultStackId).toBeUndefined();
      expect(state.stackByAgentId).toEqual({});
      expect(state.stackBySessionKey).toEqual({});
    });
  });

  it("logs diagnostics without leaking injected prompt content", async () => {
    await withTempDir(async (dataDir) => {
      const { api, logger } = createTestApi();
      const runtime = createSillyClawRuntime({ api, config: { dataDir, debug: true } });

      const preset: PresetLayer = {
        schemaVersion: 1,
        id: "p1",
        name: "P",
        blocks: [{ target: "system.prepend", order: 0, text: "TOPSECRET {{char}}" }],
      };
      const stack: PresetStack = { schemaVersion: 1, id: "s1", name: "S", layers: [preset.id], macros: { user: "Bob" } };
      await runtime.store.savePreset(preset);
      await runtime.store.saveStack(stack);
      await runtime.store.saveState({ schemaVersion: 1, defaultStackId: stack.id, stackByAgentId: {}, stackBySessionKey: {} });

      const injection = await runtime.buildPromptInjection({});
      expect(injection.prependSystemContext).toContain("TOPSECRET");
      expect(injection.prependSystemContext).toContain("{{char}}");

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const warnMsg = logger.warn.mock.calls[0]?.[0] ?? "";
      expect(warnMsg).toMatch(/missing macro mappings/i);
      expect(warnMsg).toContain("openclaw sillyclaw stacks set-macros s1");
      expect(warnMsg).not.toContain("TOPSECRET");

      expect(logger.debug).toHaveBeenCalled();
      const debugMsg = logger.debug.mock.calls[0]?.[0] ?? "";
      expect(debugMsg).toContain("SillyClaw: stack=s1");
      expect(debugMsg).toContain("scope=default");
      expect(debugMsg).toMatch(/prependSystemContext=\d+ chars/);
      expect(debugMsg).not.toContain("TOPSECRET");
    });
  });
});
