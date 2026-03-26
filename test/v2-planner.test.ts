import { describe, expect, it } from "vitest";
import { importSillyTavernPresetV2 } from "../src/v2/import/sillytavern.js";
import { planStackRenderV2 } from "../src/v2/planner.js";
import { renderHookArtifactV2 } from "../src/v2/render-hooks.js";
import { buildComplexAcceptancePreset } from "./fixtures/complex-preset.js";

describe("planStackRenderV2", () => {
  it("only lifts provably exact hook windows and preserves the remainder for the engine path", () => {
    const bundle = importSillyTavernPresetV2({
      layerId: "layer-plan",
      name: "Planner",
      importedAt: "2026-03-25T00:00:00.000Z",
      raw: {
        prompts: [
          { identifier: "lead", name: "Lead", role: "system", system_prompt: true, content: "LEAD" },
          { identifier: "personaDescription", name: "Persona", marker: true, role: "system", system_prompt: true, content: "" },
          { identifier: "anchored", name: "Anchored", role: "system", system_prompt: false, content: "ANCHORED" },
          { identifier: "chatHistory", name: "History", marker: true, role: "system", system_prompt: true, content: "" },
          { identifier: "afterHistory", name: "After History", role: "system", system_prompt: false, content: "AFTER" },
          {
            identifier: "depthControl",
            name: "Depth Control",
            role: "system",
            system_prompt: false,
            content: "DEPTH",
            injection_position: 1,
            injection_depth: 2,
            injection_order: -100,
          },
          { identifier: "late", name: "Late", role: "system", system_prompt: false, content: "LATE" },
        ],
        prompt_order: [
          {
            character_id: 100001,
            order: [
              { identifier: "lead", enabled: true },
              { identifier: "personaDescription", enabled: true },
              { identifier: "anchored", enabled: true },
              { identifier: "chatHistory", enabled: true },
              { identifier: "afterHistory", enabled: true },
              { identifier: "depthControl", enabled: true },
              { identifier: "late", enabled: true },
            ],
          },
        ],
      },
    });

    const stack = bundle.stacks[0];
    expect(stack).toBeDefined();

    const plan = planStackRenderV2({
      stack: stack!,
      layers: [bundle.layer],
    });
    const hookArtifact = renderHookArtifactV2(plan);

    expect(plan.hookEnvelope.prependSystem.map((entry) => entry.fragmentId)).toEqual(["lead"]);
    expect(plan.hookEnvelope.appendSystem).toEqual([]);
    expect(plan.hookEnvelope.prependContext.map((entry) => entry.fragmentId)).toEqual(["afterHistory"]);

    expect(plan.engineInsertions.map((insertion) => [insertion.entry.fragmentId, insertion.reason])).toEqual([
      ["anchored", "engine-required-anchor-relative"],
      ["depthControl", "engine-required-absolute-insertion"],
      ["late", "engine-required-sequence-boundary"],
    ]);

    expect(hookArtifact.injection).toEqual({
      prependSystemContext: "LEAD",
      prependContext: "AFTER",
    });
  });

  it("keeps the complex acceptance preset mostly on the engine path instead of fabricating hook placement", () => {
    const bundle = importSillyTavernPresetV2({
      layerId: "reference-layer",
      name: "Reference",
      importedAt: "2026-03-25T00:00:00.000Z",
      raw: buildComplexAcceptancePreset(),
    });
    const stack = bundle.stacks.find((candidate) => candidate.id === "reference-layer--character-100001");
    expect(stack).toBeDefined();

    const plan = planStackRenderV2({
      stack: stack!,
      layers: [bundle.layer],
    });

    expect(plan.hookEnvelope.prependSystem.length).toBeGreaterThan(0);
    expect(plan.hookEnvelope.appendSystem).toEqual([]);
    expect(plan.hookEnvelope.prependContext).toEqual([]);
    expect(plan.engineInsertions.some((insertion) => insertion.reason === "engine-required-absolute-insertion")).toBe(
      true,
    );
    expect(plan.engineInsertions.some((insertion) => insertion.reason === "engine-required-non-system-role")).toBe(
      true,
    );
  });
});
