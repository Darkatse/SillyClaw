import { describe, expect, it, vi } from "vitest";
import { createSillyClawV2Runtime } from "../src/v2/runtime.js";
import { buildSinglePromptPreset } from "./fixtures/basic-preset.js";
import { withTempDir, writeJsonFixture } from "./helpers/io.js";

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

function buildRegexPreset() {
  return {
    prompts: [{ identifier: "main", role: "system", system_prompt: true, content: "MAIN" }],
    prompt_order: [{ identifier: "main", enabled: true }],
    extensions: {
      regex_scripts: [
        {
          id: "replace-user",
          scriptName: "Replace User",
          findRegex: "/Alice/giu",
          replaceString: "Bob",
          placement: [1],
          promptOnly: true,
        },
        {
          id: "replace-assistant",
          scriptName: "Replace Assistant",
          findRegex: "/BOT/giu",
          replaceString: "ALLY",
          placement: [2],
          promptOnly: true,
          minDepth: 0,
          maxDepth: 0,
        },
      ],
    },
  };
}

function buildEngineRegexPreset(content: string) {
  return {
    ...buildEnginePreset(content),
    extensions: buildRegexPreset().extensions,
  };
}

describe("SillyClaw v2 runtime", () => {
  it("resolves active stack with precedence session > agent > default", async () => {
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const defaultBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "default.json", buildSinglePromptPreset("DEFAULT")) },
      );
      const agentBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "agent.json", buildSinglePromptPreset("AGENT")) },
      );
      const sessionBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "session.json", buildSinglePromptPreset("SESSION")) },
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
        regexRuleCount: 0,
        injectionSizes: {
          prependSystemContext: 7,
          appendSystemContext: 0,
          prependContext: 0,
        },
      });
    });
  });

  it("reuses the saved artifact on warm builds", async () => {
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const logger = {
        debug: vi.fn<(message: string) => void>(),
      };
      const runtime = createSillyClawV2Runtime({
        dataDir,
        debug: true,
        logger,
      });

      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "single.json", buildSinglePromptPreset("CACHEABLE")) },
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
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "active.json", buildSinglePromptPreset("ACTIVE")) },
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
        regexRuleCount: 0,
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
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });

      const defaultBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "default-engine.json", buildEnginePreset("DEFAULT")) },
      );
      const agentBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "agent-engine.json", buildEnginePreset("AGENT")) },
      );
      const sessionBundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "session-engine.json", buildEnginePreset("SESSION")) },
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
        { role: "assistant", content: [{ type: "text", text: "SESSION" }] },
      ]);

      expect(await runtime.buildContextMessages({ messages: [...baseMessages] })).toMatchObject([
        { role: "user", content: "history" },
        { role: "assistant", content: [{ type: "text", text: "DEFAULT" }] },
      ]);
    });
  });

  it("rewrites transcript history with regex rules before context-engine insertions", async () => {
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile({
        filePath: await writeJsonFixture(dataDir, "regex-engine.json", buildEngineRegexPreset("TAIL")),
        withRegex: true,
      });

      await runtime.useStack({ stackId: bundle.stacks[0]!.id });

      expect(
        await runtime.buildContextMessages({
          messages: [
            { role: "user", content: "Alice greets", timestamp: 1 },
            { role: "assistant", content: [{ type: "text", text: "BOT replies" }], timestamp: 2 },
          ],
        }),
      ).toMatchObject([
        { role: "user", content: "Bob greets" },
        { role: "assistant", content: [{ type: "text", text: "ALLY replies" }] },
        { role: "assistant", content: [{ type: "text", text: "TAIL" }] },
      ]);
    });
  });

  it("returns regex-rewritten messages even when the active stack has no engine artifact", async () => {
    await withTempDir("sillyclaw-v2-runtime-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile({
        filePath: await writeJsonFixture(dataDir, "regex-only.json", buildRegexPreset()),
        withRegex: true,
      });

      await runtime.useStack({ stackId: bundle.stacks[0]!.id });

      expect(
        await runtime.buildContextMessages({
          messages: [
            { role: "user", content: "Alice greets", timestamp: 1 },
            { role: "assistant", content: [{ type: "text", text: "BOT replies" }], timestamp: 2 },
          ],
        }),
      ).toEqual([
        { role: "user", content: "Bob greets", timestamp: 1 },
        { role: "assistant", content: [{ type: "text", text: "ALLY replies" }], timestamp: 2 },
      ]);
    });
  });
});
