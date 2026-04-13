import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSillyClawV2Runtime } from "../src/v2/runtime.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sillyclaw-v2-layer-management-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("SillyClaw v2 layer management", () => {
  it("updates scope enablement and ordering while invalidating referenced stack artifacts", async () => {
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "editable.json", buildEditablePreset()),
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
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "content.json", buildSimplePreset("MAIN")),
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
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "renderer.json", buildSimplePreset("MAIN")),
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
    await withTempDir(async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile(
        await writeImportFile(dataDir, "missing.json", buildSimplePreset("MAIN")),
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
});

function buildSimplePreset(content: string) {
  return {
    prompts: [{ identifier: "main", role: "system", system_prompt: true, content }],
    prompt_order: [{ identifier: "main", enabled: true }],
  };
}

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

async function writeImportFile(
  dataDir: string,
  fileName: string,
  raw: unknown,
): Promise<{ filePath: string }> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf-8");
  return { filePath };
}
