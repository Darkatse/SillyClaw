import { describe, expect, it } from "vitest";
import { importSillyTavernRegexRulesV2 } from "../src/v2/import/sillytavern-regex.js";

describe("importSillyTavernRegexRulesV2", () => {
  it("imports supported regex rules from PromptManager-style wrapped data", () => {
    const imported = importSillyTavernRegexRulesV2({
      source: {
        kind: "sillytavern",
        fileName: "wrapped.json",
        fileHashSha256: "hash-1",
        importedAt: "2026-04-12T00:00:00.000Z",
      },
      raw: {
        data: {
          extensions: {
            regex_scripts: [
              {
                id: "wrapped-rule",
                scriptName: "Wrapped Rule",
                findRegex: "/Alice/giu",
                replaceString: "Bob",
                placement: [1, 1, 2],
                promptOnly: true,
                disabled: true,
                minDepth: 0,
                maxDepth: 2,
              },
            ],
          },
        },
      },
    });

    expect(imported.source).toEqual({
      kind: "sillytavern",
      fileName: "wrapped.json",
      fileHashSha256: "hash-1",
      importedAt: "2026-04-12T00:00:00.000Z",
    });
    expect(imported.rules).toEqual([
      {
        id: "wrapped-rule",
        name: "Wrapped Rule",
        findRegex: "/Alice/giu",
        replaceString: "Bob",
        placements: ["user-input", "ai-output"],
        disabled: true,
        minDepth: 0,
        maxDepth: 2,
      },
    ]);
    expect(imported.summary).toEqual({
      importedCount: 1,
      skippedMarkdownOnlyCount: 0,
      skippedNonPromptOnlyCount: 0,
      skippedUnsupportedPlacementCount: 0,
      skippedUnsupportedSubstitutionCount: 0,
      skippedUnsupportedTrimCount: 0,
    });
  });

  it("treats markdownOnly as dominant over every other import condition", () => {
    const imported = importSillyTavernRegexRulesV2({
      raw: {
        extensions: {
          regex_scripts: [
            {
              id: "markdown-dominates",
              scriptName: "Markdown Dominates",
              findRegex: "/Alice/giu",
              replaceString: "Bob",
              placement: [1],
              markdownOnly: true,
              promptOnly: false,
              substituteRegex: 1,
              trimStrings: ["Alice"],
            },
          ],
        },
      },
    });

    expect(imported.rules).toEqual([]);
    expect(imported.summary).toEqual({
      importedCount: 0,
      skippedMarkdownOnlyCount: 1,
      skippedNonPromptOnlyCount: 0,
      skippedUnsupportedPlacementCount: 0,
      skippedUnsupportedSubstitutionCount: 0,
      skippedUnsupportedTrimCount: 0,
    });
  });

  it("returns an empty import summary when no regex extension exists", () => {
    const imported = importSillyTavernRegexRulesV2({
      source: {
        kind: "sillytavern",
        fileName: "no-regex.json",
        fileHashSha256: "hash-2",
        importedAt: "2026-04-12T00:00:00.000Z",
      },
      raw: {
        prompts: [{ identifier: "main", role: "system", system_prompt: true, content: "MAIN" }],
        prompt_order: [{ identifier: "main", enabled: true }],
      },
    });

    expect(imported.source).toEqual({
      kind: "sillytavern",
      fileName: "no-regex.json",
      fileHashSha256: "hash-2",
      importedAt: "2026-04-12T00:00:00.000Z",
    });
    expect(imported.rules).toEqual([]);
    expect(imported.summary).toEqual({
      importedCount: 0,
      skippedMarkdownOnlyCount: 0,
      skippedNonPromptOnlyCount: 0,
      skippedUnsupportedPlacementCount: 0,
      skippedUnsupportedSubstitutionCount: 0,
      skippedUnsupportedTrimCount: 0,
    });
  });

  it("throws when an importable rule contains an invalid regex string", () => {
    expect(() =>
      importSillyTavernRegexRulesV2({
        raw: {
          extensions: {
            regex_scripts: [
              {
                id: "invalid-rule",
                scriptName: "Invalid Rule",
                findRegex: "/[/giu",
                replaceString: "Bob",
                placement: [1],
                promptOnly: true,
              },
            ],
          },
        },
      }),
    ).toThrow("invalid regex string");
  });
});
