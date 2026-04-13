import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSillyClawV2Runtime } from "../src/v2/runtime.js";
import { buildComplexAcceptancePreset } from "./fixtures/complex-preset.js";
import { withTempDir, writeJsonFixture } from "./helpers/io.js";

describe("SillyClaw v2 observability", () => {
  it("exposes placement summaries and diagnostics for the complex acceptance preset", async () => {
    await withTempDir("sillyclaw-v2-observability-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile({
        filePath: await writeJsonFixture(dataDir, "complex.json", buildComplexAcceptancePreset()),
      });
      const stack = bundle.stacks.find((candidate) => candidate.id.endsWith("--character-100001"));
      expect(stack).toBeDefined();

      expect(await runtime.inspectCache()).toEqual({
        layers: 1,
        stacks: 2,
        selections: {
          defaultStackId: undefined,
          agents: 0,
          sessions: 0,
        },
        artifacts: {
          stored: 0,
          tracked: 0,
          warm: 0,
          stale: 0,
          cold: 2,
          orphaned: 0,
        },
      });

      await runtime.useStack({ stackId: stack!.id });
      const injection = await runtime.buildPromptInjection({});
      expect((injection.prependSystemContext?.length ?? 0) > 0).toBe(true);

      const active = await runtime.inspectActive({});
      expect(active).toMatchObject({
        scope: "default",
        stackId: stack!.id,
        preferredRenderer: "context-engine",
        cacheSource: "artifact",
      });
      if (active.scope === "none") {
        throw new Error("Expected an active stack.");
      }
      expect(active.placementSummary.hook.prependSystem).toBeGreaterThan(0);
      expect(active.placementSummary.engine.beforeHistory).toBeGreaterThan(0);
      expect(active.placementSummary.engine.afterHistory).toBeGreaterThan(0);
      expect(active.placementSummary.engine.absolute).toBeGreaterThan(0);

      const inspection = await runtime.inspectStack({ stackId: stack!.id });
      expect(inspection.importDiagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        expect.arrayContaining(["multiple-scopes", "unsupported-syntax", "mixed-roles", "absolute-insertions"]),
      );
      expect(inspection.planDiagnostics.some((diagnostic) => diagnostic.code === "engine-required-absolute-insertion")).toBe(
        true,
      );
      expect(inspection.planDiagnostics.some((diagnostic) => diagnostic.code === "engine-required-non-system-role")).toBe(
        true,
      );
      expect(inspection.placementSummary).toMatchObject({
        hook: {
          prependSystem: expect.any(Number),
          appendSystem: 0,
          prependContext: 0,
        },
        engine: {
          beforeHistory: expect.any(Number),
          afterHistory: expect.any(Number),
          absolute: expect.any(Number),
        },
      });
      expect(inspection.placementSummary.hook.prependSystem).toBeGreaterThan(0);
      expect(inspection.placementSummary.engine.beforeHistory).toBeGreaterThan(0);
      expect(inspection.placementSummary.engine.afterHistory).toBeGreaterThan(0);
      expect(inspection.placementSummary.engine.absolute).toBeGreaterThan(0);

      const stackIndex = await runtime.listStackIndex();
      expect(stackIndex.find((entry) => entry.id === stack!.id)?.placementSummary).toEqual(inspection.placementSummary);
    });
  });

  it("classifies warm, stale, cold, and orphaned artifacts in cache stats", async () => {
    await withTempDir("sillyclaw-v2-observability-test-", async (dataDir) => {
      const runtime = createSillyClawV2Runtime({ dataDir });
      const bundle = await runtime.importSillyTavernFromFile({
        filePath: await writeJsonFixture(dataDir, "complex.json", buildComplexAcceptancePreset()),
      });
      const warmStack = bundle.stacks.find((candidate) => candidate.id.endsWith("--character-100001"));
      const staleStack = bundle.stacks.find((candidate) => candidate.id.endsWith("--character-100000"));
      expect(warmStack).toBeDefined();
      expect(staleStack).toBeDefined();

      await runtime.useStack({ stackId: warmStack!.id });
      await runtime.buildPromptInjection({});

      const stacksIndexPath = path.join(dataDir, "v2", "indexes", "stacks.json");
      const stackIndex = JSON.parse(await fs.readFile(stacksIndexPath, "utf-8")) as Array<Record<string, unknown>>;
      const nextStackIndex = stackIndex.map((entry) =>
        entry.id === staleStack!.id
          ? {
              ...entry,
              artifactKey: "missing-artifact",
            }
          : entry,
      );
      await fs.writeFile(stacksIndexPath, JSON.stringify(nextStackIndex, null, 2), "utf-8");
      await fs.writeFile(path.join(dataDir, "v2", "artifacts", "orphan.json"), "{}", "utf-8");

      expect(await runtime.inspectCache()).toEqual({
        layers: 1,
        stacks: 2,
        selections: {
          defaultStackId: warmStack!.id,
          agents: 0,
          sessions: 0,
        },
        artifacts: {
          stored: 2,
          tracked: 2,
          warm: 1,
          stale: 1,
          cold: 0,
          orphaned: 1,
        },
      });
    });
  });
});
