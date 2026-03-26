import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSillyClawV2Runtime } from "../src/v2/runtime.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sillyclaw-v2-runtime-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function buildPreset(content: string) {
  return {
    prompts: [{ identifier: "main", role: "system", system_prompt: true, content }],
    prompt_order: [{ identifier: "main", enabled: true }],
  };
}

function buildEnginePreset(content: string) {
  return {
    prompts: [
      { identifier: "main", role: "system", system_prompt: true, content: "MAIN" },
      { identifier: "chatHistory", marker: true, role: "system", system_prompt: true, content: "" },
      { identifier: "tail", role: "assistant", system_prompt: false, content },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: "main", enabled: true },
          { identifier: "chatHistory", enabled: true },
          { identifier: "tail", enabled: true },
        ],
      },
    ],
  };
}

describe("SillyClaw v2 runtime", () => {
  it("resolves active stack with precedence session > agent > default", async () => {
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const defaultBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "default.json", buildPreset("DEFAULT")),
      );
      const agentBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "agent.json", buildPreset("AGENT")),
      );
      const sessionBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "session.json", buildPreset("SESSION")),
      );

      await runtime.useStack({ stackId: defaultBundle.stacks[0]!.id });
      await runtime.useStack({ stackId: agentBundle.stacks[0]!.id, agentId: "agentA" });
      await runtime.useStack({ stackId: sessionBundle.stacks[0]!.id, sessionKey: "sessionX" });

      expect(
        await runtime.buildPromptInjection({ agentId: "agentA", sessionKey: "sessionX" }),
      ).toEqual({ prependSystemContext: "SESSION" });
      expect(await runtime.buildPromptInjection({ agentId: "agentA" })).toEqual({
        prependSystemContext: "AGENT",
      });
      expect(await runtime.buildPromptInjection({ agentId: "agentA", allowAgentFallback: false })).toEqual({
        prependSystemContext: "DEFAULT",
      });
      expect(await runtime.buildPromptInjection({})).toEqual({
        prependSystemContext: "DEFAULT",
      });

      expect(await runtime.inspectActive({ agentId: "agentA", sessionKey: "sessionX" })).toEqual({
        scope: "session",
        stackId: sessionBundle.stacks[0]!.id,
        stackName: sessionBundle.stacks[0]!.name,
        preferredRenderer: "hooks",
        artifactKey: expect.any(String),
        cacheSource: "artifact",
        placementSummary: {
          hook: {
            prependSystem: 1,
            appendSystem: 0,
            prependContext: 0,
          },
          engine: {
            beforeHistory: 0,
            afterHistory: 0,
            absolute: 0,
          },
        },
        diagnosticsSummary: [],
        injectionSizes: {
          prependSystemContext: 7,
          appendSystemContext: 0,
          prependContext: 0,
        },
      });
    });
  });

  it("reuses the saved artifact on warm builds", async () => {
    await withTempDir(async (dataDir) => {
      const logger = {
        debug: vi.fn<(message: string) => void>(),
      };
      const runtime = createSillyClawV2Runtime({
        dataDir,
        debug: true,
        logger,
      });

      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "single.json", buildPreset("CACHEABLE")),
      );
      const stackId = bundle.stacks[0]!.id;

      await runtime.useStack({ stackId });

      expect(await runtime.buildPromptInjection({})).toEqual({
        prependSystemContext: "CACHEABLE",
      });
      expect(await runtime.loadState()).toEqual({
        schemaVersion: 2,
        defaultStackId: stackId,
        stackByAgentId: {},
        stackBySessionKey: {},
      });

      expect(await runtime.buildPromptInjection({})).toEqual({
        prependSystemContext: "CACHEABLE",
      });

      const lastDebugMessage = logger.debug.mock.calls.at(-1)?.[0] ?? "";
      expect(lastDebugMessage).toContain("source=artifact");
      expect(lastDebugMessage).toContain(`stack=${stackId}`);
    });
  });

  it("inspects the active stack from index and artifact data without hydrating bodies on the warm path", async () => {
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "active.json", buildPreset("ACTIVE")),
      );
      const stackId = bundle.stacks[0]!.id;
      await runtime.useStack({ stackId });
      await runtime.buildPromptInjection({});

      const loadStackSpy = vi.spyOn(runtime.store, "loadStack");
      const loadLayerSpy = vi.spyOn(runtime.store, "loadLayer");

      expect(await runtime.inspectActive({})).toEqual({
        scope: "default",
        stackId,
        stackName: bundle.stacks[0]!.name,
        preferredRenderer: "hooks",
        artifactKey: expect.any(String),
        cacheSource: "artifact",
        placementSummary: {
          hook: {
            prependSystem: 1,
            appendSystem: 0,
            prependContext: 0,
          },
          engine: {
            beforeHistory: 0,
            afterHistory: 0,
            absolute: 0,
          },
        },
        diagnosticsSummary: [],
        injectionSizes: {
          prependSystemContext: 6,
          appendSystemContext: 0,
          prependContext: 0,
        },
      });

      expect(loadStackSpy).not.toHaveBeenCalled();
      expect(loadLayerSpy).not.toHaveBeenCalled();
    });
  });

  it("uses session/default selection for context-engine assembly", async () => {
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const defaultBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "default-engine.json", buildEnginePreset("DEFAULT")),
      );
      const agentBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "agent-engine.json", buildEnginePreset("AGENT")),
      );
      const sessionBundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "session-engine.json", buildEnginePreset("SESSION")),
      );

      await runtime.useStack({ stackId: defaultBundle.stacks[0]!.id });
      await runtime.useStack({ stackId: agentBundle.stacks[0]!.id, agentId: "agentA" });
      await runtime.useStack({ stackId: sessionBundle.stacks[0]!.id, sessionKey: "sessionX" });

      const baseMessages = [{ role: "user", content: "history", timestamp: 1 }] as const;

      expect(
        await runtime.buildContextMessages({
          sessionKey: "sessionX",
          messages: [...baseMessages],
        }),
      ).toMatchObject([
        { role: "user", content: "history" },
        { role: "assistant", content: "SESSION" },
      ]);

      expect(await runtime.buildContextMessages({ messages: [...baseMessages] })).toMatchObject([
        { role: "user", content: "history" },
        { role: "assistant", content: "DEFAULT" },
      ]);
    });
  });
});

async function writeImportFile(
  dataDir: string,
  fileName: string,
  raw: unknown,
): Promise<{ filePath: string }> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf-8");
  return { filePath };
}
