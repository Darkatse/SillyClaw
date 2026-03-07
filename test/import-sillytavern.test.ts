import { describe, expect, it } from "vitest";
import { importSillyTavernPreset } from "../src/import/sillytavern.js";

describe("importSillyTavernPreset", () => {
  it("imports PromptManager export wrapper and maps targets around chatHistory", () => {
    const preset = importSillyTavernPreset({
      raw: {
        data: {
          prompts: [
            { identifier: "pre", content: "PRE" },
            { identifier: "main", content: "MAIN" },
            { identifier: "chatHistory", marker: true, content: "" },
            { identifier: "post", content: "POST" },
            { identifier: "marker", marker: true, content: "MARK" },
          ],
          prompt_order: [
            { identifier: "pre", enabled: true },
            { identifier: "main", enabled: true },
            { identifier: "chatHistory", enabled: true },
            { identifier: "post", enabled: true },
            { identifier: "missing", enabled: true },
            { identifier: "marker", enabled: true },
          ],
        },
      },
      id: "p1",
      name: "Example",
      sourceFileName: "preset.json",
      sourceFileHashSha256: "hash",
      importedAt: "2026-03-07T00:00:00.000Z",
    });

    expect(preset.id).toBe("p1");
    expect(preset.name).toBe("Example");
    expect(preset.source).toEqual({
      kind: "sillytavern",
      fileName: "preset.json",
      fileHashSha256: "hash",
      importedAt: "2026-03-07T00:00:00.000Z",
    });

    expect(preset.blocks).toEqual([
      { target: "system.prepend", order: 0, text: "PRE", enabled: true, blockKey: "pre" },
      { target: "system.prepend", order: 1, text: "MAIN", enabled: true, blockKey: "main" },
      { target: "user.prepend", order: 3, text: "POST", enabled: true, blockKey: "post" },
    ]);
  });

  it("maps prompts before chatHistory to system.prepend even when main is missing", () => {
    const preset = importSillyTavernPreset({
      raw: {
        prompts: [
          { identifier: "pre", content: "PRE" },
          { identifier: "chatHistory", marker: true, content: "" },
          { identifier: "post", content: "POST" },
        ],
        prompt_order: [
          { identifier: "pre", enabled: true },
          { identifier: "chatHistory", enabled: true },
          { identifier: "post", enabled: true },
        ],
      },
      id: "p2",
      name: "NoMain",
      importedAt: "2026-03-07T00:00:00.000Z",
    });

    expect(preset.blocks).toEqual([
      { target: "system.prepend", order: 0, text: "PRE", enabled: true, blockKey: "pre" },
      { target: "user.prepend", order: 2, text: "POST", enabled: true, blockKey: "post" },
    ]);
  });

  it("prefers OpenAI prompt_order character_id 100001 (fallback 100000)", () => {
    const preset = importSillyTavernPreset({
      raw: {
        prompts: [
          { identifier: "before", content: "BEFORE" },
          { identifier: "main", content: "MAIN" },
          { identifier: "chatHistory", marker: true, content: "" },
          { identifier: "after", content: "AFTER" },
        ],
        prompt_order: [
          {
            character_id: 100000,
            order: [
              { identifier: "before", enabled: true },
              { identifier: "chatHistory", enabled: true },
              { identifier: "after", enabled: true },
            ],
          },
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
      id: "p3",
      name: "OpenAI",
      importedAt: "2026-03-07T00:00:00.000Z",
    });

    expect(preset.blocks).toEqual([
      { target: "system.prepend", order: 0, text: "MAIN", enabled: true, blockKey: "main" },
      { target: "user.prepend", order: 2, text: "AFTER", enabled: true, blockKey: "after" },
    ]);
  });

  it("can override mainTarget (e.g. place main into user.prepend)", () => {
    const preset = importSillyTavernPreset({
      raw: {
        prompts: [
          { identifier: "main", content: "MAIN" },
          { identifier: "chatHistory", marker: true, content: "" },
        ],
        prompt_order: [
          { identifier: "main", enabled: true },
          { identifier: "chatHistory", enabled: true },
        ],
      },
      id: "p4",
      name: "MainAsUser",
      importedAt: "2026-03-07T00:00:00.000Z",
      mainTarget: "user.prepend",
    });

    expect(preset.blocks).toEqual([{ target: "user.prepend", order: 0, text: "MAIN", enabled: true, blockKey: "main" }]);
  });

  it("throws on unsupported prompt_order formats", () => {
    expect(() =>
      importSillyTavernPreset({
        raw: { prompts: [], prompt_order: [{}] },
        name: "Bad",
        importedAt: "2026-03-07T00:00:00.000Z",
      }),
    ).toThrow(/unsupported prompt_order format/i);
  });
});

