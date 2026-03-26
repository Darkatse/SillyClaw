import { describe, expect, it } from "vitest";
import { importSillyTavernPresetV2 } from "../src/v2/import/sillytavern.js";
import { planStackRenderV2 } from "../src/v2/planner.js";
import {
  assembleContextEngineMessagesV2,
  renderContextEngineArtifactV2,
} from "../src/v2/render-context-engine.js";

describe("renderContextEngineArtifactV2", () => {
  it("compiles planner remainder into before-history, after-history, and depth instructions", () => {
    const bundle = importSillyTavernPresetV2({
      layerId: "layer-engine",
      name: "Engine",
      importedAt: "2026-03-25T00:00:00.000Z",
      raw: {
        prompts: [
          { identifier: "lead", name: "Lead", role: "system", system_prompt: true, content: "LEAD" },
          { identifier: "personaDescription", name: "Persona", marker: true, role: "system", system_prompt: true, content: "" },
          { identifier: "anchored", name: "Anchored", role: "user", system_prompt: false, content: "BEFORE" },
          { identifier: "chatHistory", name: "History", marker: true, role: "system", system_prompt: true, content: "" },
          { identifier: "tail", name: "Tail", role: "assistant", system_prompt: false, content: "AFTER" },
          {
            identifier: "depthControl",
            name: "Depth Control",
            role: "system",
            system_prompt: false,
            content: "DEPTH",
            injection_position: 1,
            injection_depth: 1,
            injection_order: -100,
          },
        ],
        prompt_order: [
          {
            character_id: 100001,
            order: [
              { identifier: "lead", enabled: true },
              { identifier: "personaDescription", enabled: true },
              { identifier: "anchored", enabled: true },
              { identifier: "chatHistory", enabled: true },
              { identifier: "tail", enabled: true },
              { identifier: "depthControl", enabled: true },
            ],
          },
        ],
      },
    });

    const artifact = renderContextEngineArtifactV2(
      planStackRenderV2({
        stack: bundle.stacks[0]!,
        layers: [bundle.layer],
      }),
    );

    expect(artifact.beforeHistory).toMatchObject([{ role: "user", content: "BEFORE" }]);
    expect(artifact.afterHistory).toMatchObject([{ role: "assistant", content: "AFTER" }]);
    expect(artifact.absolute).toMatchObject([
      { role: "system", content: "DEPTH", depth: 1, order: -100 },
    ]);
  });

  it("mirrors SillyTavern absolute depth ordering when assembling messages", () => {
    const messages = assembleContextEngineMessagesV2({
      artifact: {
        beforeHistory: [{ entryKeys: ["before"], role: "system", content: "BEFORE" }],
        afterHistory: [{ entryKeys: ["after"], role: "assistant", content: "AFTER" }],
        absolute: [
          { entryKeys: ["depth-0"], role: "system", content: "DEPTH0", depth: 0, order: 100 },
          { entryKeys: ["depth-1-high"], role: "user", content: "U_HIGH", depth: 1, order: 100 },
          { entryKeys: ["depth-1-low-system"], role: "system", content: "S_LOW", depth: 1, order: -100 },
          { entryKeys: ["depth-1-low-assistant"], role: "assistant", content: "A_LOW", depth: 1, order: -100 },
        ],
      },
      messages: [
        { role: "user", content: "m1", timestamp: 1 },
        { role: "assistant", content: "m2", timestamp: 2 },
        { role: "user", content: "m3", timestamp: 3 },
      ],
    });

    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["system", "BEFORE"],
      ["user", "m1"],
      ["assistant", "m2"],
      ["assistant", "A_LOW"],
      ["system", "S_LOW"],
      ["user", "U_HIGH"],
      ["user", "m3"],
      ["system", "DEPTH0"],
      ["assistant", "AFTER"],
    ]);

    expect(messages.find((message) => message.role === "assistant" && message.content === "AFTER")).toMatchObject({
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
    });
  });
});
