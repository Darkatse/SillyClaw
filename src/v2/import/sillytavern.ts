import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AnchorBindingV2,
  ImportedPresetBundleV2,
  PresetLayerV2,
  PromptFragmentV2,
  PromptRoleV2,
  PromptScopeEntryV2,
  PromptScopeSourceV2,
  PromptScopeV2,
  StackV2,
} from "../model.js";
import { DEFAULT_OPENCLAW_CONTENT_BINDINGS_V2, SILLYCLAW_V2_SCHEMA_VERSION } from "../model.js";
import { detectFeatureFlagsV2, finalizeLayerV2, resolveScopePreferredRendererV2 } from "../layer-derived.js";
import { importSillyTavernRegexRulesV2 } from "./sillytavern-regex.js";
import {
  asArray,
  asBoolean,
  asRecord,
  asString,
  extractPromptManagerContainer,
  type RecordValue,
} from "./sillytavern-shared.js";

type StPrompt = {
  identifier: string;
  name?: string;
  role?: string;
  content?: string;
  marker?: boolean;
  system_prompt?: boolean;
  injection_position?: number;
  injection_depth?: number;
  injection_order?: number;
  forbid_overrides?: boolean;
  injection_trigger?: string[];
};

type StPromptOrderEntry = {
  identifier: string;
  enabled: boolean;
};

type StPromptOrderScope = {
  id: string;
  name: string;
  sourceScope: PromptScopeSourceV2;
  entries: StPromptOrderEntry[];
};

function parsePrompts(container: RecordValue): StPrompt[] {
  const prompts = asArray(container.prompts, "prompts");
  return prompts.map((value, index) => {
    const record = asRecord(value, `prompts[${index}]`);
    return {
      identifier: asString(record.identifier, `prompts[${index}].identifier`),
      name: typeof record.name === "string" ? record.name : undefined,
      role: typeof record.role === "string" ? record.role : undefined,
      content: typeof record.content === "string" ? record.content : undefined,
      marker: typeof record.marker === "boolean" ? record.marker : undefined,
      system_prompt: typeof record.system_prompt === "boolean" ? record.system_prompt : undefined,
      injection_position: typeof record.injection_position === "number" ? record.injection_position : undefined,
      injection_depth: typeof record.injection_depth === "number" ? record.injection_depth : undefined,
      injection_order: typeof record.injection_order === "number" ? record.injection_order : undefined,
      forbid_overrides: typeof record.forbid_overrides === "boolean" ? record.forbid_overrides : undefined,
      injection_trigger: Array.isArray(record.injection_trigger)
        ? record.injection_trigger.filter((entry): entry is string => typeof entry === "string")
        : undefined,
    };
  });
}

function parsePromptOrderScopes(container: RecordValue): StPromptOrderScope[] {
  const promptOrder = asArray(container.prompt_order, "prompt_order");
  const first = promptOrder[0];
  if (first === undefined) {
    return [];
  }

  const firstRecord = asRecord(first, "prompt_order[0]");
  if (typeof firstRecord.identifier === "string") {
    return [
      {
        id: "default",
        name: "Default Scope",
        sourceScope: { kind: "flat-prompt-order" },
        entries: promptOrder.map((value, index) => {
          const record = asRecord(value, `prompt_order[${index}]`);
          return {
            identifier: asString(record.identifier, `prompt_order[${index}].identifier`),
            enabled: asBoolean(record.enabled, `prompt_order[${index}].enabled`),
          };
        }),
      },
    ];
  }

  if (firstRecord.character_id !== undefined) {
    return promptOrder.map((value, index) => {
      const record = asRecord(value, `prompt_order[${index}]`);
      const characterId = Number(record.character_id);
      if (!Number.isFinite(characterId)) {
        throw new Error(`SillyTavern v2 import: expected prompt_order[${index}].character_id to be a number.`);
      }
      const order = asArray(record.order, `prompt_order[${index}].order`);
      return {
        id: `character-${characterId}`,
        name: `Character ${characterId}`,
        sourceScope: { kind: "character-prompt-order", characterId },
        entries: order.map((entry, orderIndex) => {
          const orderRecord = asRecord(entry, `prompt_order[${index}].order[${orderIndex}]`);
          return {
            identifier: asString(orderRecord.identifier, `prompt_order[${index}].order[${orderIndex}].identifier`),
            enabled: asBoolean(orderRecord.enabled, `prompt_order[${index}].order[${orderIndex}].enabled`),
          };
        }),
      };
    });
  }

  throw new Error("SillyTavern v2 import: unsupported prompt_order format.");
}

function normalizeRole(prompt: StPrompt): PromptRoleV2 {
  if (prompt.role === "system" || prompt.role === "user" || prompt.role === "assistant") {
    return prompt.role;
  }
  return "system";
}

function detectAnchorBinding(identifier: string, marker: boolean): AnchorBindingV2 | undefined {
  const anchors: Record<string, AnchorBindingV2> = {
    main: "main",
    personaDescription: "persona",
    charDescription: "character.description",
    charPersonality: "character.personality",
    scenario: "character.scenario",
    worldInfoBefore: "world-info.before",
    worldInfoAfter: "world-info.after",
    dialogueExamples: "dialogue-examples",
    chatHistory: "chat-history",
  };
  const binding = anchors[identifier];
  if (binding) {
    return binding;
  }
  return marker ? "unknown-marker" : undefined;
}

function toFragment(prompt: StPrompt): PromptFragmentV2 {
  const marker = prompt.marker === true;
  const contentTemplate = prompt.content ?? "";
  return {
    id: prompt.identifier,
    sourceIdentifier: prompt.identifier,
    name: prompt.name ?? prompt.identifier,
    role: normalizeRole(prompt),
    contentTemplate,
    marker,
    systemPrompt: prompt.system_prompt === true,
    anchorBinding: detectAnchorBinding(prompt.identifier, marker),
    triggerPolicy: prompt.injection_trigger ?? [],
    insertion:
      prompt.injection_position === 1
        ? {
            kind: "absolute",
            depth: prompt.injection_depth ?? 4,
            order: prompt.injection_order ?? 100,
          }
        : { kind: "relative" },
    forbidOverrides: prompt.forbid_overrides === true,
    featureFlags: detectFeatureFlagsV2(contentTemplate),
  };
}

function toScopeEntries(scope: StPromptOrderScope, fragmentsById: Map<string, PromptFragmentV2>): PromptScopeEntryV2[] {
  return scope.entries
    .filter((entry) => fragmentsById.has(entry.identifier))
    .map((entry, ordinal) => ({
      fragmentId: entry.identifier,
      enabled: entry.enabled,
      ordinal,
    }));
}

export type ImportSillyTavernPresetV2Params = {
  raw: unknown;
  name: string;
  layerId?: string;
  sourceFileName?: string;
  importedAt?: string;
  sourceFileHashSha256?: string;
  withRegex?: boolean;
};

export function importSillyTavernPresetV2(params: ImportSillyTavernPresetV2Params): ImportedPresetBundleV2 {
  const container = extractPromptManagerContainer(params.raw);
  const prompts = parsePrompts(container);
  const layerId = params.layerId ?? randomUUID();
  const source = {
    kind: "sillytavern" as const,
    fileName: params.sourceFileName,
    fileHashSha256: params.sourceFileHashSha256,
    importedAt: params.importedAt ?? new Date().toISOString(),
  };
  const regexImport = params.withRegex
    ? importSillyTavernRegexRulesV2({
        raw: params.raw,
        source,
      })
    : undefined;

  const fragments = prompts.map(toFragment);
  const fragmentsById = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const scopes = parsePromptOrderScopes(container).map((scope): PromptScopeV2 => {
    const entries = toScopeEntries(scope, fragmentsById);
    return {
      id: scope.id,
      name: scope.name,
      sourceScope: scope.sourceScope,
      entries,
      preferredRenderer: resolveScopePreferredRendererV2(entries, fragmentsById),
    };
  });

  const layer = finalizeLayerV2({
    schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
    id: layerId,
    name: params.name || path.parse(params.sourceFileName ?? "import").name,
    source,
    regexSource: regexImport?.source,
    fragments,
    scopes,
    regexRules: regexImport?.rules ?? [],
    featureSummary: [],
    diagnostics: [],
  } satisfies PresetLayerV2);

  const stacks = layer.scopes.map<StackV2>((scope) => ({
    schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
    id: `${layerId}--${scope.id}`,
    name: `${layer.name} (${scope.name})`,
    layers: [{ layerId, scopeId: scope.id }],
    preferredRenderer: scope.preferredRenderer,
    contentBindings: {
      persona: { ...DEFAULT_OPENCLAW_CONTENT_BINDINGS_V2.persona },
      character: {
        kind: DEFAULT_OPENCLAW_CONTENT_BINDINGS_V2.character.kind,
        paths: [...DEFAULT_OPENCLAW_CONTENT_BINDINGS_V2.character.paths],
      },
    },
  }));

  return {
    layer,
    stacks,
    regexImport: regexImport?.summary,
  };
}
