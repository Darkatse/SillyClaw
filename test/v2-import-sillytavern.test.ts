import { describe, expect, it } from "vitest";
import { importSillyTavernPresetV2 } from "../src/v2/import/sillytavern.js";

describe("importSillyTavernPresetV2", () => {
  it("preserves every prompt_order scope and prefers the context engine for mixed-role absolute scopes", () => {
    const bundle = importSillyTavernPresetV2({
      layerId: "layer-v2",
      name: "Complex",
      importedAt: "2026-03-25T00:00:00.000Z",
      raw: {
        prompts: [
          { identifier: "main", name: "Main", role: "system", system_prompt: true, content: "MAIN" },
          { identifier: "personaDescription", name: "Persona", marker: true, role: "system", system_prompt: true, content: "" },
          { identifier: "chatHistory", name: "History", marker: true, role: "system", system_prompt: true, content: "" },
          {
            identifier: "macroUser",
            name: "Macro User",
            role: "user",
            system_prompt: false,
            content: "{{setvar::x::1}} <regex order=1>...</regex>",
          },
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
          { identifier: "afterAssistant", name: "After Assistant", role: "assistant", system_prompt: false, content: "POST" },
        ],
        prompt_order: [
          {
            character_id: 100000,
            order: [
              { identifier: "main", enabled: true },
              { identifier: "chatHistory", enabled: true },
            ],
          },
          {
            character_id: 100001,
            order: [
              { identifier: "macroUser", enabled: true },
              { identifier: "personaDescription", enabled: true },
              { identifier: "chatHistory", enabled: true },
              { identifier: "depthControl", enabled: true },
              { identifier: "afterAssistant", enabled: true },
              { identifier: "missing", enabled: true },
            ],
          },
        ],
      },
    });

    expect(bundle.layer.id).toBe("layer-v2");
    expect(bundle.layer.scopes.map((scope) => scope.id)).toEqual(["character-100000", "character-100001"]);
    expect(bundle.layer.featureSummary).toEqual(["contains-setvar", "contains-regex-tag"]);
    expect(bundle.layer.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["multiple-scopes", "unsupported-syntax", "mixed-roles", "absolute-insertions"]),
    );

    const persona = bundle.layer.fragments.find((fragment) => fragment.id === "personaDescription");
    expect(persona).toMatchObject({
      marker: true,
      anchorBinding: "persona",
    });

    const simpleScope = bundle.layer.scopes.find((scope) => scope.id === "character-100000");
    expect(simpleScope?.preferredRenderer).toBe("hybrid");
    expect(simpleScope?.entries).toEqual([
      { fragmentId: "main", enabled: true, ordinal: 0 },
      { fragmentId: "chatHistory", enabled: true, ordinal: 1 },
    ]);

    const complexScope = bundle.layer.scopes.find((scope) => scope.id === "character-100001");
    expect(complexScope?.preferredRenderer).toBe("context-engine");
    expect(complexScope?.entries.map((entry) => entry.fragmentId)).toEqual([
      "macroUser",
      "personaDescription",
      "chatHistory",
      "depthControl",
      "afterAssistant",
    ]);

    expect(bundle.stacks).toEqual([
      expect.objectContaining({
        id: "layer-v2--character-100000",
        preferredRenderer: "hybrid",
        contentBindings: {
          persona: { kind: "file", path: "USER.md" },
          character: { kind: "files", paths: ["SOUL.md", "IDENTITY.md"] },
        },
      }),
      expect.objectContaining({
        id: "layer-v2--character-100001",
        preferredRenderer: "context-engine",
      }),
    ]);
  });

  it("preserves disabled structural entries such as main inside the source scope", () => {
    const bundle = importSillyTavernPresetV2({
      layerId: "layer-disabled",
      name: "Disabled Main",
      importedAt: "2026-03-25T00:00:00.000Z",
      raw: {
        prompts: [
          { identifier: "main", role: "system", system_prompt: true, content: "MAIN" },
          { identifier: "chatHistory", marker: true, role: "system", system_prompt: true, content: "" },
        ],
        prompt_order: [
          {
            character_id: 100001,
            order: [
              { identifier: "chatHistory", enabled: true },
              { identifier: "main", enabled: false },
            ],
          },
        ],
      },
    });

    expect(bundle.layer.scopes[0]?.entries).toEqual([
      { fragmentId: "chatHistory", enabled: true, ordinal: 0 },
      { fragmentId: "main", enabled: false, ordinal: 1 },
    ]);
  });
});
