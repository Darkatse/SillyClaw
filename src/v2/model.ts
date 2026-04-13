export const SILLYCLAW_V2_SCHEMA_VERSION = 2 as const;

export type SillyClawV2SchemaVersion = typeof SILLYCLAW_V2_SCHEMA_VERSION;

export type PromptRoleV2 = "system" | "user" | "assistant";

export type RegexPlacementV2 = "user-input" | "ai-output";

export type RegexRuleV2 = {
  id: string;
  name: string;
  findRegex: string;
  replaceString: string;
  placements: RegexPlacementV2[];
  disabled: boolean;
  minDepth?: number;
  maxDepth?: number;
};

export type PromptFeatureFlagV2 =
  | "contains-setvar"
  | "contains-getvar"
  | "contains-comment-macro"
  | "contains-regex-tag"
  | "contains-no-trans-tag"
  | "contains-think-tag";

export type PromptInsertionV2 =
  | { kind: "relative" }
  | {
      kind: "absolute";
      depth: number;
      order: number;
    };

export type AnchorBindingV2 =
  | "main"
  | "persona"
  | "character.description"
  | "character.personality"
  | "character.scenario"
  | "world-info.before"
  | "world-info.after"
  | "dialogue-examples"
  | "chat-history"
  | "unknown-marker";

export type PromptFragmentV2 = {
  id: string;
  sourceIdentifier: string;
  name: string;
  role: PromptRoleV2;
  contentTemplate: string;
  marker: boolean;
  systemPrompt: boolean;
  anchorBinding?: AnchorBindingV2;
  triggerPolicy: string[];
  insertion: PromptInsertionV2;
  forbidOverrides: boolean;
  featureFlags: PromptFeatureFlagV2[];
};

export type PromptScopeSourceV2 =
  | { kind: "flat-prompt-order" }
  | {
      kind: "character-prompt-order";
      characterId: number;
    };

export type RendererPreferenceV2 = "hooks" | "hybrid" | "context-engine";

export type PromptScopeEntryV2 = {
  fragmentId: string;
  enabled: boolean;
  ordinal: number;
};

export type PromptScopeV2 = {
  id: string;
  name: string;
  sourceScope: PromptScopeSourceV2;
  entries: PromptScopeEntryV2[];
  preferredRenderer: RendererPreferenceV2;
};

export type DiagnosticSeverityV2 = "info" | "warn";

export type ImportDiagnosticCodeV2 =
  | "multiple-scopes"
  | "mixed-roles"
  | "absolute-insertions"
  | "unsupported-syntax";

export type ImportDiagnosticV2 = {
  code: ImportDiagnosticCodeV2;
  severity: DiagnosticSeverityV2;
  message: string;
  scopeId?: string;
};

export type PlanDiagnosticCodeV2 =
  | "engine-required-sequence-boundary"
  | "engine-required-anchor-relative"
  | "engine-required-non-system-role"
  | "engine-required-absolute-insertion"
  | "marker-content-ignored";

export type DiagnosticCodeV2 = ImportDiagnosticCodeV2 | PlanDiagnosticCodeV2;

export type PlanDiagnosticV2 = {
  code: PlanDiagnosticCodeV2;
  severity: DiagnosticSeverityV2;
  message: string;
  stackId: string;
  layerId: string;
  scopeId: string;
  fragmentId: string;
  entryKey: string;
};

export type PresetLayerSourceV2 = {
  kind: "sillytavern";
  fileName?: string;
  fileHashSha256?: string;
  importedAt: string;
};

export type PresetLayerV2 = {
  schemaVersion: SillyClawV2SchemaVersion;
  id: string;
  name: string;
  source?: PresetLayerSourceV2;
  regexSource?: PresetLayerSourceV2;
  fragments: PromptFragmentV2[];
  scopes: PromptScopeV2[];
  regexRules: RegexRuleV2[];
  featureSummary: PromptFeatureFlagV2[];
  diagnostics: ImportDiagnosticV2[];
};

export type StackLayerRefV2 = {
  layerId: string;
  scopeId: string;
};

export type OpenClawContentBindingsV2 = {
  persona: {
    kind: "file";
    path: string;
  };
  character: {
    kind: "files";
    paths: string[];
  };
};

export const DEFAULT_OPENCLAW_CONTENT_BINDINGS_V2 = {
  persona: { kind: "file", path: "USER.md" },
  character: { kind: "files", paths: ["SOUL.md", "IDENTITY.md"] },
} as const satisfies OpenClawContentBindingsV2;

export type StackV2 = {
  schemaVersion: SillyClawV2SchemaVersion;
  id: string;
  name: string;
  layers: StackLayerRefV2[];
  preferredRenderer: RendererPreferenceV2;
  contentBindings?: OpenClawContentBindingsV2;
};

export type SillyClawStateV2 = {
  schemaVersion: SillyClawV2SchemaVersion;
  defaultStackId?: string;
  stackByAgentId: Record<string, string>;
  stackBySessionKey: Record<string, string>;
};

export type LayerIndexEntryV2 = {
  id: string;
  name: string;
  sourceKind?: PresetLayerSourceV2["kind"];
  updatedAt: string;
  fragmentCount: number;
  scopeCount: number;
  absoluteCount: number;
  regexCount: number;
  enabledRegexCount: number;
  placementSummary: RendererPreferenceV2[];
  hash: string;
};

export type StackIndexEntryV2 = {
  id: string;
  name: string;
  layerIds: string[];
  scopeIds: string[];
  updatedAt: string;
  hash: string;
  artifactKey?: string;
  placementSummary?: PlacementSummaryV2;
  preferredRenderer: RendererPreferenceV2;
  diagnosticsSummary: DiagnosticCodeV2[];
};

export type PlacementSummaryV2 = {
  hook: {
    prependSystem: number;
    appendSystem: number;
    prependContext: number;
  };
  engine: {
    beforeHistory: number;
    afterHistory: number;
    absolute: number;
  };
};

export type HistorySegmentV2 = "before-history" | "after-history" | "no-history";

export type ResolvedScopeEntryV2 = {
  key: string;
  stackId: string;
  layerId: string;
  scopeId: string;
  sequenceOrdinal: number;
  fragmentId: string;
  sourceIdentifier: string;
  name: string;
  role: PromptRoleV2;
  contentTemplate: string;
  marker: boolean;
  systemPrompt: boolean;
  anchorBinding?: AnchorBindingV2;
  triggerPolicy: string[];
  insertion: PromptInsertionV2;
  forbidOverrides: boolean;
  featureFlags: PromptFeatureFlagV2[];
  historySegment: HistorySegmentV2;
  previousAnchorBinding?: AnchorBindingV2;
  nextAnchorBinding?: AnchorBindingV2;
};

export type HookEnvelopeV2 = {
  prependSystem: ResolvedScopeEntryV2[];
  appendSystem: ResolvedScopeEntryV2[];
  prependContext: ResolvedScopeEntryV2[];
};

export type EngineInsertionV2 = {
  entry: ResolvedScopeEntryV2;
  reason: PlanDiagnosticCodeV2;
};

export type RenderPlanV2 = {
  stackId: string;
  stackName: string;
  preferredRenderer: RendererPreferenceV2;
  sequence: ResolvedScopeEntryV2[];
  hookEnvelope: HookEnvelopeV2;
  engineInsertions: EngineInsertionV2[];
  diagnostics: PlanDiagnosticV2[];
};

export type HookPromptInjectionV2 = {
  prependSystemContext?: string;
  appendSystemContext?: string;
  prependContext?: string;
};

export type HookArtifactV2 = {
  injection: HookPromptInjectionV2;
  entryKeys: {
    prependSystem: string[];
    appendSystem: string[];
    prependContext: string[];
  };
};

export type EngineMessageInstructionV2 = {
  entryKeys: string[];
  role: PromptRoleV2;
  content: string;
};

export type EngineAbsoluteInstructionV2 = EngineMessageInstructionV2 & {
  depth: number;
  order: number;
};

export type EngineArtifactV2 = {
  beforeHistory: EngineMessageInstructionV2[];
  afterHistory: EngineMessageInstructionV2[];
  absolute: EngineAbsoluteInstructionV2[];
};

export type CompiledRegexRuleV2 = RegexRuleV2 & {
  key: string;
  stackId: string;
  layerId: string;
  ruleId: string;
};

export type RegexArtifactV2 = {
  rules: CompiledRegexRuleV2[];
};

export type StackArtifactV2 = {
  schemaVersion: SillyClawV2SchemaVersion;
  key: string;
  stackId: string;
  plannerVersion: string;
  rendererVersion: string;
  createdAt: string;
  hookArtifact?: HookArtifactV2;
  engineArtifact?: EngineArtifactV2;
  regexArtifact?: RegexArtifactV2;
  diagnosticsSummary: DiagnosticCodeV2[];
};

export type ImportedPresetBundleV2 = {
  layer: PresetLayerV2;
  stacks: StackV2[];
  regexImport?: RegexImportSummaryV2;
};

export type RegexImportSummaryV2 = {
  importedCount: number;
  skippedMarkdownOnlyCount: number;
  skippedNonPromptOnlyCount: number;
  skippedUnsupportedPlacementCount: number;
  skippedUnsupportedSubstitutionCount: number;
  skippedUnsupportedTrimCount: number;
};
