import { describe, expect, it } from "vitest";
import { createSillyClawV2Runtime } from "../src/v2/runtime.js";
import { buildSinglePromptPreset } from "./fixtures/basic-preset.js";
import { withTempDir, writeJsonFixture } from "./helpers/io.js";

describe("SillyClaw v2 layer management", () => {
  it("updates scope enablement and ordering while invalidating referenced stack artifacts", async () => {
    await withTempDir("sillyclaw-v2-layer-management-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "editable.json", buildEditablePreset()) },
      );
      const layerId = bundle.layer.id;
      const stackId = bundle.stacks[0]!.id;

      await runtime.useStack({ stackId });
      await runtime.buildPromptInjection({});

      const enabled = await runtime.setLayerScopeEntryEnabled({
        layerId,
        scopeId: "character-100001",
        fragmentId: "tail",
        enabled: true,
      });
      expect(enabled.scope.entries).toEqual([
        { fragmentId: "main", enabled: true, ordinal: 0 },
        { fragmentId: "style", enabled: true, ordinal: 1 },
        { fragmentId: "chatHistory", enabled: true, ordinal: 2 },
        { fragmentId: "tail", enabled: true, ordinal: 3 },
      ]);
      expect(enabled.affectedStackIds).toEqual([stackId]);

      const moved = await runtime.moveLayerScopeEntry({
        layerId,
        scopeId: "character-100001",
        fragmentId: "tail",
        beforeFragmentId: "chatHistory",
      });
      expect(moved.scope.entries).toEqual([
        { fragmentId: "main", enabled: true, ordinal: 0 },
        { fragmentId: "style", enabled: true, ordinal: 1 },
        { fragmentId: "tail", enabled: true, ordinal: 2 },
        { fragmentId: "chatHistory", enabled: true, ordinal: 3 },
      ]);

      const stackIndex = await runtime.listStackIndex();
      expect(stackIndex).toEqual([
        expect.objectContaining({
          id: stackId,
          artifactKey: undefined,
          placementSummary: undefined,
        }),
      ]);
    });
  });

  it("recomputes fragment feature flags and layer diagnostics after content edits", async () => {
    await withTempDir("sillyclaw-v2-layer-management-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "content.json", buildSinglePromptPreset("MAIN")) },
      );

      const result = await runtime.setLayerFragmentContent({
        layerId: bundle.layer.id,
        fragmentId: "main",
        content: "{{setvar::x::1}} <regex order=1>...</regex>",
      });

      expect(result.fragment.featureFlags).toEqual(["contains-setvar", "contains-regex-tag"]);
      expect(result.layer.featureSummary).toEqual(["contains-setvar", "contains-regex-tag"]);
      expect(result.layer.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unsupported-syntax");
    });
  });

  it("recomputes scope and stack renderer preference after insertion edits", async () => {
    await withTempDir("sillyclaw-v2-layer-management-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "renderer.json", buildSinglePromptPreset("MAIN")) },
      );
      const stackId = bundle.stacks[0]!.id;

      const result = await runtime.setLayerFragmentInsertion({
        layerId: bundle.layer.id,
        fragmentId: "main",
        insertion: { kind: "absolute", depth: 2, order: -100 },
      });

      expect(result.fragment.insertion).toEqual({
        kind: "absolute",
        depth: 2,
        order: -100,
      });
      expect(result.layer.scopes[0]?.preferredRenderer).toBe("context-engine");
      expect(result.updatedStacks).toEqual([
        expect.objectContaining({
          id: stackId,
          preferredRenderer: "context-engine",
        }),
      ]);
      expect(await runtime.loadStack(stackId)).toMatchObject({
        preferredRenderer: "context-engine",
      });
    });
  });

  it("throws on missing mutation targets", async () => {
    await withTempDir("sillyclaw-v2-layer-management-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "missing.json", buildSinglePromptPreset("MAIN")) },
      );

      await expect(
        runtime.moveLayerScopeEntry({
          layerId: bundle.layer.id,
          scopeId: "default",
          fragmentId: "missing",
          beforeFragmentId: "main",
        }),
      ).rejects.toThrow("missing scope entry");
    });
  });

  it("imports layer-owned regex rules from a preset file and supports enablement and ordering edits", async () => {
    await withTempDir("sillyclaw-v2-layer-management-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        { filePath: await writeJsonFixture(dataDir, "regex-layer.json", buildSinglePromptPreset("MAIN")) },
      );
      const stackId = bundle.stacks[0]!.id;

      await runtime.useStack({ stackId });
      await runtime.buildPromptInjection({});

      const imported = await runtime.replaceLayerRegexFromFile({
        layerId: bundle.layer.id,
        filePath: await writeJsonFixture(dataDir, "rules.json", buildRegexImportPreset()),
      });

      expect(imported.regexSource).toEqual({
        kind: "sillytavern",
        fileName: "rules.json",
        fileHashSha256: expect.any(String),
        importedAt: expect.any(String),
      });
      expect(imported.regexImport).toEqual({
        importedCount: 2,
        skippedMarkdownOnlyCount: 1,
        skippedNonPromptOnlyCount: 0,
        skippedUnsupportedPlacementCount: 0,
        skippedUnsupportedSubstitutionCount: 0,
        skippedUnsupportedTrimCount: 0,
      });
      expect(imported.layer.regexRules.map((rule) => rule.id)).toEqual(["replace-user", "replace-assistant"]);
      expect(imported.affectedStackIds).toEqual([stackId]);
      expect(imported.updatedStacks).toEqual([]);

      const disabled = await runtime.setLayerRegexRuleEnabled({
        layerId: bundle.layer.id,
        ruleId: "replace-user",
        enabled: false,
      });
      expect(disabled.rule.disabled).toBe(true);

      const moved = await runtime.moveLayerRegexRule({
        layerId: bundle.layer.id,
        ruleId: "replace-assistant",
        beforeRuleId: "replace-user",
      });
      expect(moved.layer.regexRules.map((rule) => rule.id)).toEqual(["replace-assistant", "replace-user"]);

      const stackIndex = await runtime.listStackIndex();
      expect(stackIndex).toEqual([
        expect.objectContaining({
          id: stackId,
          artifactKey: undefined,
          placementSummary: undefined,
        }),
      ]);
    });
  });
});

function buildEditablePreset() {
  return {
    prompts: [
      { identifier: "main", role: "system", system_prompt: true, content: "MAIN" },
      { identifier: "style", role: "system", system_prompt: true, content: "STYLE" },
      { identifier: "chatHistory", marker: true, role: "system", system_prompt: true, content: "" },
      { identifier: "tail", role: "system", system_prompt: false, content: "TAIL" },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: "main", enabled: true },
          { identifier: "style", enabled: true },
          { identifier: "chatHistory", enabled: true },
          { identifier: "tail", enabled: false },
        ],
      },
    ],
  };
}

function buildRegexImportPreset() {
  return {
    prompts: [{ identifier: "main", role: "system", system_prompt: true, content: "MAIN" }],
    prompt_order: [{ identifier: "main", enabled: true }],
    extensions: {
      regex_scripts: [
        {
          id: "markdown-skip",
          scriptName: "Markdown Skip",
          findRegex: "/markdown/giu",
          replaceString: "skip",
          placement: [1],
          markdownOnly: true,
          promptOnly: true,
        },
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
        },
      ],
    },
  };
}
