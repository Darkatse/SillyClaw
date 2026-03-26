import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importSillyTavernPresetV2 } from "../src/v2/import/sillytavern.js";
import { SILLYCLAW_V2_SCHEMA_VERSION } from "../src/v2/model.js";
import { SillyClawV2Store } from "../src/v2/store.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sillyclaw-v2-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("SillyClawV2Store", () => {
  it("persists imported bundles and maintains index-only listings", async () => {
    await withTempDir(async (dataDir) => {
      const store = new SillyClawV2Store({ dataDir });
      const bundle = importSillyTavernPresetV2({
        layerId: "layer-store",
        name: "Stored Import",
        importedAt: "2026-03-25T00:00:00.000Z",
        raw: {
          prompts: [
            { identifier: "main", role: "system", system_prompt: true, content: "MAIN" },
            { identifier: "chatHistory", marker: true, role: "system", system_prompt: true, content: "" },
            { identifier: "after", role: "assistant", system_prompt: false, content: "AFTER" },
          ],
          prompt_order: [
            {
              character_id: 100001,
              order: [
                { identifier: "main", enabled: true },
                { identifier: "chatHistory", enabled: true },
                { identifier: "after", enabled: true },
              ],
            },
          ],
        },
      });

      await store.saveImportedBundle(bundle);

      expect(await store.loadLayer("layer-store")).toMatchObject({
        id: "layer-store",
        scopes: [{ id: "character-100001" }],
      });

      expect(await store.loadStack("layer-store--character-100001")).toMatchObject({
        id: "layer-store--character-100001",
        preferredRenderer: "context-engine",
      });

      expect(await store.listLayerIndex()).toEqual([
        expect.objectContaining({
          id: "layer-store",
          fragmentCount: 3,
          scopeCount: 1,
          absoluteCount: 0,
          placementSummary: ["context-engine"],
        }),
      ]);

      expect(await store.listStackIndex()).toEqual([
        expect.objectContaining({
          id: "layer-store--character-100001",
          layerIds: ["layer-store"],
          scopeIds: ["character-100001"],
          hash: expect.any(String),
          preferredRenderer: "context-engine",
        }),
      ]);
    });
  });

  it("tracks artifacts in the stack index while state remains selection-only", async () => {
    await withTempDir(async (dataDir) => {
      const store = new SillyClawV2Store({ dataDir });
      const bundle = importSillyTavernPresetV2({
        layerId: "layer-artifact",
        name: "Artifact Import",
        importedAt: "2026-03-25T00:00:00.000Z",
        raw: {
          prompts: [{ identifier: "main", role: "system", system_prompt: true, content: "MAIN" }],
          prompt_order: [{ identifier: "main", enabled: true }],
        },
      });

      await store.saveImportedBundle(bundle);
      await store.saveArtifact({
        schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
        key: "artifact-1",
        stackId: "layer-artifact--default",
        plannerVersion: "planner-1",
        rendererVersion: "renderer-1",
        createdAt: "2026-03-25T00:00:00.000Z",
        diagnosticsSummary: [],
      });

      expect(await store.loadArtifact("artifact-1")).toMatchObject({
        key: "artifact-1",
        stackId: "layer-artifact--default",
      });

      expect(await store.loadState()).toEqual({
        schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
        defaultStackId: undefined,
        stackByAgentId: {},
        stackBySessionKey: {},
      });

      expect(await store.listStackIndex()).toEqual([
        expect.objectContaining({
          id: "layer-artifact--default",
          hash: expect.any(String),
          artifactKey: "artifact-1",
          placementSummary: {
            hook: {
              prependSystem: 0,
              appendSystem: 0,
              prependContext: 0,
            },
            engine: {
              beforeHistory: 0,
              afterHistory: 0,
              absolute: 0,
            },
          },
        }),
      ]);
    });
  });

  it("invalidates stack artifacts when a referenced layer changes", async () => {
    await withTempDir(async (dataDir) => {
      const store = new SillyClawV2Store({ dataDir });
      const bundle = importSillyTavernPresetV2({
        layerId: "layer-invalidate",
        name: "Invalidate Import",
        importedAt: "2026-03-25T00:00:00.000Z",
        raw: {
          prompts: [{ identifier: "main", role: "system", system_prompt: true, content: "MAIN" }],
          prompt_order: [{ identifier: "main", enabled: true }],
        },
      });

      await store.saveImportedBundle(bundle);
      await store.saveArtifact({
        schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
        key: "artifact-2",
        stackId: "layer-invalidate--default",
        plannerVersion: "planner-1",
        rendererVersion: "renderer-1",
        createdAt: "2026-03-25T00:00:00.000Z",
        diagnosticsSummary: ["unsupported-syntax"],
      });

      await store.saveLayer({
        ...bundle.layer,
        fragments: bundle.layer.fragments.map((fragment) =>
          fragment.id === "main" ? { ...fragment, contentTemplate: "UPDATED" } : fragment,
        ),
      });

      expect(await store.loadState()).toEqual({
        schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
        defaultStackId: undefined,
        stackByAgentId: {},
        stackBySessionKey: {},
      });

      expect(await store.listStackIndex()).toEqual([
        expect.objectContaining({
          id: "layer-invalidate--default",
          artifactKey: undefined,
          placementSummary: undefined,
          diagnosticsSummary: [],
        }),
      ]);
    });
  });
});
