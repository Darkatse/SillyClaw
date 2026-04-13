import type {
  AnchorBindingV2,
  DiagnosticCodeV2,
  DiagnosticSeverityV2,
  EngineAbsoluteInstructionV2,
  EngineArtifactV2,
  EngineInsertionV2,
  EngineMessageInstructionV2,
  HookArtifactV2,
  HookPromptInjectionV2,
  ImportDiagnosticCodeV2,
  ImportDiagnosticV2,
  LayerIndexEntryV2,
  OpenClawContentBindingsV2,
  PlanDiagnosticCodeV2,
  PlanDiagnosticV2,
  PlacementSummaryV2,
  PresetLayerSourceV2,
  PresetLayerV2,
  RegexArtifactV2,
  RegexPlacementV2,
  RegexRuleV2,
  PromptFeatureFlagV2,
  PromptFragmentV2,
  PromptInsertionV2,
  PromptRoleV2,
  PromptScopeEntryV2,
  PromptScopeSourceV2,
  PromptScopeV2,
  RendererPreferenceV2,
  RenderPlanV2,
  ResolvedScopeEntryV2,
  SillyClawStateV2,
  SillyClawV2SchemaVersion,
  StackArtifactV2,
  StackIndexEntryV2,
  StackLayerRefV2,
  StackV2,
  HookEnvelopeV2,
  HistorySegmentV2,
} from "./model.js";
import { SILLYCLAW_V2_SCHEMA_VERSION } from "./model.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) {
    throw new Error(`SillyClaw v2 schema: expected ${label} to be an object.`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`SillyClaw v2 schema: expected ${label} to be an array.`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`SillyClaw v2 schema: expected ${label} to be a string.`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`SillyClaw v2 schema: expected ${label} to be a boolean.`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SillyClaw v2 schema: expected ${label} to be a finite number.`);
  }
  return value;
}

function parseSchemaVersion(raw: RecordValue): SillyClawV2SchemaVersion {
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== SILLYCLAW_V2_SCHEMA_VERSION) {
    throw new Error(`SillyClaw v2 schema: unsupported schemaVersion: ${String(schemaVersion)}`);
  }
  return SILLYCLAW_V2_SCHEMA_VERSION;
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asString(value, label);
}

function parseStringArray(value: unknown, label: string): string[] {
  return asArray(value, label).map((item, index) => asString(item, `${label}[${index}]`));
}

function parsePromptRole(value: unknown, label: string): PromptRoleV2 {
  const role = asString(value, label);
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${role}`);
}

function parseFeatureFlag(value: unknown, label: string): PromptFeatureFlagV2 {
  const feature = asString(value, label);
  if (
    feature === "contains-setvar" ||
    feature === "contains-getvar" ||
    feature === "contains-comment-macro" ||
    feature === "contains-regex-tag" ||
    feature === "contains-no-trans-tag" ||
    feature === "contains-think-tag"
  ) {
    return feature;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${feature}`);
}

function parseAnchorBinding(value: unknown, label: string): AnchorBindingV2 {
  const binding = asString(value, label);
  if (
    binding === "main" ||
    binding === "persona" ||
    binding === "character.description" ||
    binding === "character.personality" ||
    binding === "character.scenario" ||
    binding === "world-info.before" ||
    binding === "world-info.after" ||
    binding === "dialogue-examples" ||
    binding === "chat-history" ||
    binding === "unknown-marker"
  ) {
    return binding;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${binding}`);
}

function parseRendererPreference(value: unknown, label: string): RendererPreferenceV2 {
  const preference = asString(value, label);
  if (preference === "hooks" || preference === "hybrid" || preference === "context-engine") {
    return preference;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${preference}`);
}

function parseRegexPlacement(value: unknown, label: string): RegexPlacementV2 {
  const placement = asString(value, label);
  if (placement === "user-input" || placement === "ai-output") {
    return placement;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${placement}`);
}

function parsePromptInsertion(value: unknown, label: string): PromptInsertionV2 {
  const record = asRecord(value, label);
  const kind = asString(record.kind, `${label}.kind`);
  if (kind === "relative") {
    return { kind };
  }
  if (kind === "absolute") {
    return {
      kind,
      depth: asNumber(record.depth, `${label}.depth`),
      order: asNumber(record.order, `${label}.order`),
    };
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}.kind: ${kind}`);
}

function parsePromptScopeSource(value: unknown, label: string): PromptScopeSourceV2 {
  const record = asRecord(value, label);
  const kind = asString(record.kind, `${label}.kind`);
  if (kind === "flat-prompt-order") {
    return { kind };
  }
  if (kind === "character-prompt-order") {
    return {
      kind,
      characterId: asNumber(record.characterId, `${label}.characterId`),
    };
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}.kind: ${kind}`);
}

function parseDiagnosticSeverity(value: unknown, label: string): DiagnosticSeverityV2 {
  const severity = asString(value, label);
  if (severity === "info" || severity === "warn") {
    return severity;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${severity}`);
}

function parseImportDiagnosticCode(value: unknown, label: string): ImportDiagnosticCodeV2 {
  const code = asString(value, label);
  if (
    code === "multiple-scopes" ||
    code === "mixed-roles" ||
    code === "absolute-insertions" ||
    code === "unsupported-syntax"
  ) {
    return code;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${code}`);
}

function parsePlanDiagnosticCode(value: unknown, label: string): PlanDiagnosticCodeV2 {
  const code = asString(value, label);
  if (
    code === "engine-required-sequence-boundary" ||
    code === "engine-required-anchor-relative" ||
    code === "engine-required-non-system-role" ||
    code === "engine-required-absolute-insertion" ||
    code === "marker-content-ignored"
  ) {
    return code;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${code}`);
}

function parseDiagnosticCode(value: unknown, label: string): DiagnosticCodeV2 {
  try {
    return parseImportDiagnosticCode(value, label);
  } catch {
    return parsePlanDiagnosticCode(value, label);
  }
}

function parseHistorySegment(value: unknown, label: string): HistorySegmentV2 {
  const segment = asString(value, label);
  if (segment === "before-history" || segment === "after-history" || segment === "no-history") {
    return segment;
  }
  throw new Error(`SillyClaw v2 schema: invalid ${label}: ${segment}`);
}

function parseLayerSource(value: unknown, label: string): PresetLayerSourceV2 {
  const record = asRecord(value, label);
  const kind = asString(record.kind, `${label}.kind`);
  if (kind !== "sillytavern") {
    throw new Error(`SillyClaw v2 schema: invalid ${label}.kind: ${kind}`);
  }
  return {
    kind,
    fileName: parseOptionalString(record.fileName, `${label}.fileName`),
    fileHashSha256: parseOptionalString(record.fileHashSha256, `${label}.fileHashSha256`),
    importedAt: asString(record.importedAt, `${label}.importedAt`),
  };
}

function parseRegexRule(value: unknown, label: string): RegexRuleV2 {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    name: asString(record.name, `${label}.name`),
    findRegex: asString(record.findRegex, `${label}.findRegex`),
    replaceString: asString(record.replaceString, `${label}.replaceString`),
    placements: asArray(record.placements, `${label}.placements`).map((item, index) =>
      parseRegexPlacement(item, `${label}.placements[${index}]`),
    ),
    disabled: asBoolean(record.disabled, `${label}.disabled`),
    minDepth:
      record.minDepth === undefined || record.minDepth === null
        ? undefined
        : asNumber(record.minDepth, `${label}.minDepth`),
    maxDepth:
      record.maxDepth === undefined || record.maxDepth === null
        ? undefined
        : asNumber(record.maxDepth, `${label}.maxDepth`),
  };
}

function parsePromptFragment(value: unknown, label: string): PromptFragmentV2 {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    sourceIdentifier: asString(record.sourceIdentifier, `${label}.sourceIdentifier`),
    name: asString(record.name, `${label}.name`),
    role: parsePromptRole(record.role, `${label}.role`),
    contentTemplate: asString(record.contentTemplate, `${label}.contentTemplate`),
    marker: asBoolean(record.marker, `${label}.marker`),
    systemPrompt: asBoolean(record.systemPrompt, `${label}.systemPrompt`),
    anchorBinding:
      record.anchorBinding === undefined ? undefined : parseAnchorBinding(record.anchorBinding, `${label}.anchorBinding`),
    triggerPolicy: parseStringArray(record.triggerPolicy, `${label}.triggerPolicy`),
    insertion: parsePromptInsertion(record.insertion, `${label}.insertion`),
    forbidOverrides: asBoolean(record.forbidOverrides, `${label}.forbidOverrides`),
    featureFlags: asArray(record.featureFlags, `${label}.featureFlags`).map((item, index) =>
      parseFeatureFlag(item, `${label}.featureFlags[${index}]`),
    ),
  };
}

function parsePromptScopeEntry(value: unknown, label: string): PromptScopeEntryV2 {
  const record = asRecord(value, label);
  return {
    fragmentId: asString(record.fragmentId, `${label}.fragmentId`),
    enabled: asBoolean(record.enabled, `${label}.enabled`),
    ordinal: asNumber(record.ordinal, `${label}.ordinal`),
  };
}

function parsePromptScope(value: unknown, label: string): PromptScopeV2 {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    name: asString(record.name, `${label}.name`),
    sourceScope: parsePromptScopeSource(record.sourceScope, `${label}.sourceScope`),
    entries: asArray(record.entries, `${label}.entries`).map((item, index) =>
      parsePromptScopeEntry(item, `${label}.entries[${index}]`),
    ),
    preferredRenderer: parseRendererPreference(record.preferredRenderer, `${label}.preferredRenderer`),
  };
}

function parseImportDiagnostic(value: unknown, label: string): ImportDiagnosticV2 {
  const record = asRecord(value, label);
  return {
    code: parseImportDiagnosticCode(record.code, `${label}.code`),
    severity: parseDiagnosticSeverity(record.severity, `${label}.severity`),
    message: asString(record.message, `${label}.message`),
    scopeId: parseOptionalString(record.scopeId, `${label}.scopeId`),
  };
}

function parsePlanDiagnostic(value: unknown, label: string): PlanDiagnosticV2 {
  const record = asRecord(value, label);
  return {
    code: parsePlanDiagnosticCode(record.code, `${label}.code`),
    severity: parseDiagnosticSeverity(record.severity, `${label}.severity`),
    message: asString(record.message, `${label}.message`),
    stackId: asString(record.stackId, `${label}.stackId`),
    layerId: asString(record.layerId, `${label}.layerId`),
    scopeId: asString(record.scopeId, `${label}.scopeId`),
    fragmentId: asString(record.fragmentId, `${label}.fragmentId`),
    entryKey: asString(record.entryKey, `${label}.entryKey`),
  };
}

function parseStackLayerRef(value: unknown, label: string): StackLayerRefV2 {
  const record = asRecord(value, label);
  return {
    layerId: asString(record.layerId, `${label}.layerId`),
    scopeId: asString(record.scopeId, `${label}.scopeId`),
  };
}

function parseContentBindings(value: unknown, label: string): OpenClawContentBindingsV2 {
  const record = asRecord(value, label);
  const persona = asRecord(record.persona, `${label}.persona`);
  const character = asRecord(record.character, `${label}.character`);
  if (asString(persona.kind, `${label}.persona.kind`) !== "file") {
    throw new Error(`SillyClaw v2 schema: invalid ${label}.persona.kind`);
  }
  if (asString(character.kind, `${label}.character.kind`) !== "files") {
    throw new Error(`SillyClaw v2 schema: invalid ${label}.character.kind`);
  }
  return {
    persona: {
      kind: "file",
      path: asString(persona.path, `${label}.persona.path`),
    },
    character: {
      kind: "files",
      paths: parseStringArray(character.paths, `${label}.character.paths`),
    },
  };
}

function parseResolvedScopeEntry(value: unknown, label: string): ResolvedScopeEntryV2 {
  const record = asRecord(value, label);
  return {
    key: asString(record.key, `${label}.key`),
    stackId: asString(record.stackId, `${label}.stackId`),
    layerId: asString(record.layerId, `${label}.layerId`),
    scopeId: asString(record.scopeId, `${label}.scopeId`),
    sequenceOrdinal: asNumber(record.sequenceOrdinal, `${label}.sequenceOrdinal`),
    fragmentId: asString(record.fragmentId, `${label}.fragmentId`),
    sourceIdentifier: asString(record.sourceIdentifier, `${label}.sourceIdentifier`),
    name: asString(record.name, `${label}.name`),
    role: parsePromptRole(record.role, `${label}.role`),
    contentTemplate: asString(record.contentTemplate, `${label}.contentTemplate`),
    marker: asBoolean(record.marker, `${label}.marker`),
    systemPrompt: asBoolean(record.systemPrompt, `${label}.systemPrompt`),
    anchorBinding:
      record.anchorBinding === undefined ? undefined : parseAnchorBinding(record.anchorBinding, `${label}.anchorBinding`),
    triggerPolicy: parseStringArray(record.triggerPolicy, `${label}.triggerPolicy`),
    insertion: parsePromptInsertion(record.insertion, `${label}.insertion`),
    forbidOverrides: asBoolean(record.forbidOverrides, `${label}.forbidOverrides`),
    featureFlags: asArray(record.featureFlags, `${label}.featureFlags`).map((item, index) =>
      parseFeatureFlag(item, `${label}.featureFlags[${index}]`),
    ),
    historySegment: parseHistorySegment(record.historySegment, `${label}.historySegment`),
    previousAnchorBinding:
      record.previousAnchorBinding === undefined
        ? undefined
        : parseAnchorBinding(record.previousAnchorBinding, `${label}.previousAnchorBinding`),
    nextAnchorBinding:
      record.nextAnchorBinding === undefined
        ? undefined
        : parseAnchorBinding(record.nextAnchorBinding, `${label}.nextAnchorBinding`),
  };
}

function parseHookEnvelope(value: unknown, label: string): HookEnvelopeV2 {
  const record = asRecord(value, label);
  return {
    prependSystem: asArray(record.prependSystem, `${label}.prependSystem`).map((item, index) =>
      parseResolvedScopeEntry(item, `${label}.prependSystem[${index}]`),
    ),
    appendSystem: asArray(record.appendSystem, `${label}.appendSystem`).map((item, index) =>
      parseResolvedScopeEntry(item, `${label}.appendSystem[${index}]`),
    ),
    prependContext: asArray(record.prependContext, `${label}.prependContext`).map((item, index) =>
      parseResolvedScopeEntry(item, `${label}.prependContext[${index}]`),
    ),
  };
}

function parseEngineInsertion(value: unknown, label: string): EngineInsertionV2 {
  const record = asRecord(value, label);
  return {
    entry: parseResolvedScopeEntry(record.entry, `${label}.entry`),
    reason: parsePlanDiagnosticCode(record.reason, `${label}.reason`),
  };
}

function parseEngineMessageInstruction(
  value: unknown,
  label: string,
): EngineMessageInstructionV2 {
  const record = asRecord(value, label);
  return {
    entryKeys: parseStringArray(record.entryKeys, `${label}.entryKeys`),
    role: parsePromptRole(record.role, `${label}.role`),
    content: asString(record.content, `${label}.content`),
  };
}

function parseEngineAbsoluteInstruction(
  value: unknown,
  label: string,
): EngineAbsoluteInstructionV2 {
  const record = asRecord(value, label);
  return {
    ...parseEngineMessageInstruction(record, label),
    depth: asNumber(record.depth, `${label}.depth`),
    order: asNumber(record.order, `${label}.order`),
  };
}

function parseHookPromptInjection(value: unknown, label: string): HookPromptInjectionV2 {
  const record = asRecord(value, label);
  return {
    prependSystemContext: parseOptionalString(record.prependSystemContext, `${label}.prependSystemContext`),
    appendSystemContext: parseOptionalString(record.appendSystemContext, `${label}.appendSystemContext`),
    prependContext: parseOptionalString(record.prependContext, `${label}.prependContext`),
  };
}

function parseHookArtifact(value: unknown, label: string): HookArtifactV2 {
  const record = asRecord(value, label);
  const entryKeys = asRecord(record.entryKeys, `${label}.entryKeys`);
  return {
    injection: parseHookPromptInjection(record.injection, `${label}.injection`),
    entryKeys: {
      prependSystem: parseStringArray(entryKeys.prependSystem, `${label}.entryKeys.prependSystem`),
      appendSystem: parseStringArray(entryKeys.appendSystem, `${label}.entryKeys.appendSystem`),
      prependContext: parseStringArray(entryKeys.prependContext, `${label}.entryKeys.prependContext`),
    },
  };
}

function parseEngineArtifact(value: unknown, label: string): EngineArtifactV2 {
  const record = asRecord(value, label);
  return {
    beforeHistory: asArray(record.beforeHistory, `${label}.beforeHistory`).map((item, index) =>
      parseEngineMessageInstruction(item, `${label}.beforeHistory[${index}]`),
    ),
    afterHistory: asArray(record.afterHistory, `${label}.afterHistory`).map((item, index) =>
      parseEngineMessageInstruction(item, `${label}.afterHistory[${index}]`),
    ),
    absolute: asArray(record.absolute, `${label}.absolute`).map((item, index) =>
      parseEngineAbsoluteInstruction(item, `${label}.absolute[${index}]`),
    ),
  };
}

function parseRegexArtifact(value: unknown, label: string): RegexArtifactV2 {
  const record = asRecord(value, label);
  return {
    rules: asArray(record.rules, `${label}.rules`).map((item, index) => {
      const rule = parseRegexRule(item, `${label}.rules[${index}]`);
      const entry = asRecord(item, `${label}.rules[${index}]`);
      return {
        ...rule,
        key: asString(entry.key, `${label}.rules[${index}].key`),
        stackId: asString(entry.stackId, `${label}.rules[${index}].stackId`),
        layerId: asString(entry.layerId, `${label}.rules[${index}].layerId`),
        ruleId: asString(entry.ruleId, `${label}.rules[${index}].ruleId`),
      };
    }),
  };
}

function parsePlacementSummary(value: unknown, label: string): PlacementSummaryV2 {
  const record = asRecord(value, label);
  const hook = asRecord(record.hook, `${label}.hook`);
  const engine = asRecord(record.engine, `${label}.engine`);
  return {
    hook: {
      prependSystem: asNumber(hook.prependSystem, `${label}.hook.prependSystem`),
      appendSystem: asNumber(hook.appendSystem, `${label}.hook.appendSystem`),
      prependContext: asNumber(hook.prependContext, `${label}.hook.prependContext`),
    },
    engine: {
      beforeHistory: asNumber(engine.beforeHistory, `${label}.engine.beforeHistory`),
      afterHistory: asNumber(engine.afterHistory, `${label}.engine.afterHistory`),
      absolute: asNumber(engine.absolute, `${label}.engine.absolute`),
    },
  };
}

export function parsePresetLayerV2(raw: unknown): PresetLayerV2 {
  const record = asRecord(raw, "preset layer v2");
  return {
    schemaVersion: parseSchemaVersion(record),
    id: asString(record.id, "preset layer v2.id"),
    name: asString(record.name, "preset layer v2.name"),
    source: record.source === undefined ? undefined : parseLayerSource(record.source, "preset layer v2.source"),
    regexSource:
      record.regexSource === undefined ? undefined : parseLayerSource(record.regexSource, "preset layer v2.regexSource"),
    fragments: asArray(record.fragments, "preset layer v2.fragments").map((item, index) =>
      parsePromptFragment(item, `preset layer v2.fragments[${index}]`),
    ),
    scopes: asArray(record.scopes, "preset layer v2.scopes").map((item, index) =>
      parsePromptScope(item, `preset layer v2.scopes[${index}]`),
    ),
    regexRules:
      record.regexRules === undefined
        ? []
        : asArray(record.regexRules, "preset layer v2.regexRules").map((item, index) =>
            parseRegexRule(item, `preset layer v2.regexRules[${index}]`),
          ),
    featureSummary: asArray(record.featureSummary, "preset layer v2.featureSummary").map((item, index) =>
      parseFeatureFlag(item, `preset layer v2.featureSummary[${index}]`),
    ),
    diagnostics: asArray(record.diagnostics, "preset layer v2.diagnostics").map((item, index) =>
      parseImportDiagnostic(item, `preset layer v2.diagnostics[${index}]`),
    ),
  };
}

export function parseStackV2(raw: unknown): StackV2 {
  const record = asRecord(raw, "stack v2");
  return {
    schemaVersion: parseSchemaVersion(record),
    id: asString(record.id, "stack v2.id"),
    name: asString(record.name, "stack v2.name"),
    layers: asArray(record.layers, "stack v2.layers").map((item, index) =>
      parseStackLayerRef(item, `stack v2.layers[${index}]`),
    ),
    preferredRenderer: parseRendererPreference(record.preferredRenderer, "stack v2.preferredRenderer"),
    contentBindings:
      record.contentBindings === undefined
        ? undefined
        : parseContentBindings(record.contentBindings, "stack v2.contentBindings"),
  };
}

export function parseStateV2(raw: unknown): SillyClawStateV2 {
  const record = asRecord(raw, "state v2");
  return {
    schemaVersion: parseSchemaVersion(record),
    defaultStackId: parseOptionalString(record.defaultStackId, "state v2.defaultStackId"),
    stackByAgentId: parseStringRecord(record.stackByAgentId, "state v2.stackByAgentId"),
    stackBySessionKey: parseStringRecord(record.stackBySessionKey, "state v2.stackBySessionKey"),
  };
}

export function parseLayerIndexEntryV2(raw: unknown): LayerIndexEntryV2 {
  const record = asRecord(raw, "layer index entry v2");
  const sourceKind =
    record.sourceKind === undefined ? undefined : asString(record.sourceKind, "layer index entry v2.sourceKind");
  if (sourceKind !== undefined && sourceKind !== "sillytavern") {
    throw new Error(`SillyClaw v2 schema: invalid layer index entry v2.sourceKind: ${sourceKind}`);
  }
  return {
    id: asString(record.id, "layer index entry v2.id"),
    name: asString(record.name, "layer index entry v2.name"),
    sourceKind,
    updatedAt: asString(record.updatedAt, "layer index entry v2.updatedAt"),
    fragmentCount: asNumber(record.fragmentCount, "layer index entry v2.fragmentCount"),
    scopeCount: asNumber(record.scopeCount, "layer index entry v2.scopeCount"),
    absoluteCount: asNumber(record.absoluteCount, "layer index entry v2.absoluteCount"),
    regexCount:
      record.regexCount === undefined ? 0 : asNumber(record.regexCount, "layer index entry v2.regexCount"),
    enabledRegexCount:
      record.enabledRegexCount === undefined
        ? 0
        : asNumber(record.enabledRegexCount, "layer index entry v2.enabledRegexCount"),
    placementSummary: asArray(record.placementSummary, "layer index entry v2.placementSummary").map((item, index) =>
      parseRendererPreference(item, `layer index entry v2.placementSummary[${index}]`),
    ),
    hash: asString(record.hash, "layer index entry v2.hash"),
  };
}

export function parseStackIndexEntryV2(raw: unknown): StackIndexEntryV2 {
  const record = asRecord(raw, "stack index entry v2");
  return {
    id: asString(record.id, "stack index entry v2.id"),
    name: asString(record.name, "stack index entry v2.name"),
    layerIds: parseStringArray(record.layerIds, "stack index entry v2.layerIds"),
    scopeIds: parseStringArray(record.scopeIds, "stack index entry v2.scopeIds"),
    updatedAt: asString(record.updatedAt, "stack index entry v2.updatedAt"),
    hash: asString(record.hash, "stack index entry v2.hash"),
    artifactKey: parseOptionalString(record.artifactKey, "stack index entry v2.artifactKey"),
    placementSummary:
      record.placementSummary === undefined
        ? undefined
        : parsePlacementSummary(record.placementSummary, "stack index entry v2.placementSummary"),
    preferredRenderer: parseRendererPreference(record.preferredRenderer, "stack index entry v2.preferredRenderer"),
    diagnosticsSummary: asArray(record.diagnosticsSummary, "stack index entry v2.diagnosticsSummary").map((item, index) =>
      parseDiagnosticCode(item, `stack index entry v2.diagnosticsSummary[${index}]`),
    ),
  };
}

export function parseStackArtifactV2(raw: unknown): StackArtifactV2 {
  const record = asRecord(raw, "stack artifact v2");
  return {
    schemaVersion: parseSchemaVersion(record),
    key: asString(record.key, "stack artifact v2.key"),
    stackId: asString(record.stackId, "stack artifact v2.stackId"),
    plannerVersion: asString(record.plannerVersion, "stack artifact v2.plannerVersion"),
    rendererVersion: asString(record.rendererVersion, "stack artifact v2.rendererVersion"),
    createdAt: asString(record.createdAt, "stack artifact v2.createdAt"),
    hookArtifact:
      record.hookArtifact === undefined ? undefined : parseHookArtifact(record.hookArtifact, "stack artifact v2.hookArtifact"),
    engineArtifact:
      record.engineArtifact === undefined
        ? undefined
        : parseEngineArtifact(record.engineArtifact, "stack artifact v2.engineArtifact"),
    regexArtifact:
      record.regexArtifact === undefined
        ? undefined
        : parseRegexArtifact(record.regexArtifact, "stack artifact v2.regexArtifact"),
    diagnosticsSummary: asArray(record.diagnosticsSummary, "stack artifact v2.diagnosticsSummary").map((item, index) =>
      parseDiagnosticCode(item, `stack artifact v2.diagnosticsSummary[${index}]`),
    ),
  };
}

export function parseRenderPlanV2(raw: unknown): RenderPlanV2 {
  const record = asRecord(raw, "render plan v2");
  return {
    stackId: asString(record.stackId, "render plan v2.stackId"),
    stackName: asString(record.stackName, "render plan v2.stackName"),
    preferredRenderer: parseRendererPreference(record.preferredRenderer, "render plan v2.preferredRenderer"),
    sequence: asArray(record.sequence, "render plan v2.sequence").map((item, index) =>
      parseResolvedScopeEntry(item, `render plan v2.sequence[${index}]`),
    ),
    hookEnvelope: parseHookEnvelope(record.hookEnvelope, "render plan v2.hookEnvelope"),
    engineInsertions: asArray(record.engineInsertions, "render plan v2.engineInsertions").map((item, index) =>
      parseEngineInsertion(item, `render plan v2.engineInsertions[${index}]`),
    ),
    diagnostics: asArray(record.diagnostics, "render plan v2.diagnostics").map((item, index) =>
      parsePlanDiagnostic(item, `render plan v2.diagnostics[${index}]`),
    ),
  };
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  const record = value === undefined ? {} : asRecord(value, label);
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    output[key] = asString(entry, `${label}.${key}`);
  }
  return output;
}
