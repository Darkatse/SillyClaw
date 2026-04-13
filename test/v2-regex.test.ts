import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  SILLYCLAW_V2_SCHEMA_VERSION,
  type PresetLayerV2,
  type RegexRuleV2,
  type StackV2,
} from "../src/v2/model.js";
import {
  applyRegexArtifactV2,
  assertValidRegexStringV2,
  compileRegexArtifactV2,
} from "../src/v2/regex.js";

describe("v2 regex runtime", () => {
  it("compiles enabled regex rules once per unique layer in stack order", () => {
    const layerA = buildLayer("layer-a", [
      buildRule("rule-a1", {
        findRegex: "/Alice/giu",
        replaceString: "Bob",
        placements: ["user-input"],
      }),
      buildRule("rule-a2", {
        findRegex: "/BOT/giu",
        replaceString: "ALLY",
        placements: ["ai-output"],
        disabled: true,
      }),
    ]);
    const layerB = buildLayer("layer-b", [
      buildRule("rule-b1", {
        findRegex: "/TAIL/giu",
        replaceString: "END",
        placements: ["ai-output"],
      }),
    ]);

    const artifact = compileRegexArtifactV2({
      stack: buildStack("stack-regex", ["layer-a", "layer-a", "layer-b"]),
      layers: [layerA, layerB],
    });

    expect(artifact?.rules.map((rule) => [rule.layerId, rule.ruleId])).toEqual([
      ["layer-a", "rule-a1"],
      ["layer-b", "rule-b1"],
    ]);
    expect(artifact?.rules.map((rule) => rule.key)).toEqual([
      "stack-regex:layer-a:rule-a1:0",
      "stack-regex:layer-b:rule-b1:1",
    ]);
  });

  it("rewrites only applicable transcript messages and preserves untouched references", () => {
    const nonTextBlock = { type: "image", mimeType: "image/png", image: "..." } as const;
    const messages: AgentMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "BOT oldest" }], timestamp: 1 },
      { role: "user", content: "Alice middle", timestamp: 2 },
      { role: "assistant", content: [{ type: "text", text: "BOT newest" }, nonTextBlock], timestamp: 3 } as AgentMessage,
    ];
    const artifact = {
      rules: [
        {
          ...buildRule("assistant-latest", {
            findRegex: "/BOT/giu",
            replaceString: "ALLY",
            placements: ["ai-output"],
            maxDepth: 0,
          }),
          key: "k1",
          stackId: "stack-1",
          layerId: "layer-1",
          ruleId: "assistant-latest",
        },
        {
          ...buildRule("user-middle", {
            findRegex: "/Alice/giu",
            replaceString: "Bob",
            placements: ["user-input"],
            minDepth: 1,
            maxDepth: 1,
          }),
          key: "k2",
          stackId: "stack-1",
          layerId: "layer-1",
          ruleId: "user-middle",
        },
      ],
    };

    const nextMessages = applyRegexArtifactV2({
      artifact,
      messages,
    });

    expect(nextMessages).not.toBe(messages);
    expect(nextMessages[0]).toBe(messages[0]);
    expect(nextMessages[1]).not.toBe(messages[1]);
    expect(nextMessages[2]).not.toBe(messages[2]);
    expect(nextMessages).toMatchObject([
      { role: "assistant", content: [{ type: "text", text: "BOT oldest" }] },
      { role: "user", content: "Bob middle" },
      { role: "assistant", content: [{ type: "text", text: "ALLY newest" }, nonTextBlock] },
    ]);
    expect((nextMessages[2] as { content: unknown[] }).content[1]).toBe(nonTextBlock);
  });

  it("returns the original message array when nothing changes", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "Alice system", timestamp: 1 } as AgentMessage,
      { role: "user", content: "Charlie user", timestamp: 2 },
    ];
    const artifact = {
      rules: [
        {
          ...buildRule("user-rule", {
            findRegex: "/Alice/giu",
            replaceString: "Bob",
            placements: ["user-input"],
          }),
          key: "k1",
          stackId: "stack-1",
          layerId: "layer-1",
          ruleId: "user-rule",
        },
      ],
    };

    const nextMessages = applyRegexArtifactV2({
      artifact,
      messages,
    });

    expect(nextMessages).toBe(messages);
  });

  it("supports SillyTavern-style {{match}} replacement macros", () => {
    const nextMessages = applyRegexArtifactV2({
      artifact: {
        rules: [
          {
            ...buildRule("echo-match", {
              findRegex: "/Alice/giu",
              replaceString: "{{match}}!",
              placements: ["user-input"],
            }),
            key: "k1",
            stackId: "stack-1",
            layerId: "layer-1",
            ruleId: "echo-match",
          },
        ],
      },
      messages: [{ role: "user", content: "Alice", timestamp: 1 }],
    });

    expect(nextMessages).toEqual([{ role: "user", content: "Alice!", timestamp: 1 }]);
  });

  it("throws for invalid regex strings", () => {
    expect(() => assertValidRegexStringV2("/[/giu")).toThrow("invalid regex string");
  });
});

function buildLayer(id: string, regexRules: RegexRuleV2[]): PresetLayerV2 {
  return {
    schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
    id,
    name: id,
    fragments: [],
    scopes: [],
    regexRules,
    featureSummary: [],
    diagnostics: [],
  };
}

function buildRule(
  id: string,
  params: {
    findRegex: string;
    replaceString: string;
    placements: RegexRuleV2["placements"];
    disabled?: boolean;
    minDepth?: number;
    maxDepth?: number;
  },
): RegexRuleV2 {
  return {
    id,
    name: id,
    findRegex: params.findRegex,
    replaceString: params.replaceString,
    placements: params.placements,
    disabled: params.disabled ?? false,
    minDepth: params.minDepth,
    maxDepth: params.maxDepth,
  };
}

function buildStack(id: string, layerIds: string[]): StackV2 {
  return {
    schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
    id,
    name: id,
    preferredRenderer: "hooks",
    layers: layerIds.map((layerId, index) => ({
      layerId,
      scopeId: `scope-${index}`,
    })),
  };
}
