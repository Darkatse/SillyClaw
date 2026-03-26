import type {
  DiagnosticSeverityV2,
  PlanDiagnosticCodeV2,
  PlanDiagnosticV2,
  PresetLayerV2,
  RenderPlanV2,
  ResolvedScopeEntryV2,
  StackV2,
  PromptFragmentV2,
  PromptScopeV2,
  HookEnvelopeV2,
  EngineInsertionV2,
} from "./model.js";

export const SILLYCLAW_V2_PLANNER_VERSION = "phase2";

export function planStackRenderV2(params: {
  stack: StackV2;
  layers: PresetLayerV2[];
}): RenderPlanV2 {
  const layersById = new Map(params.layers.map((layer) => [layer.id, layer]));
  const baseSequence: ResolvedScopeEntryV2[] = [];

  for (const layerRef of params.stack.layers) {
    const layer = layersById.get(layerRef.layerId);
    if (!layer) {
      throw new Error(`SillyClaw v2 planner: stack references missing layer: ${layerRef.layerId}`);
    }

    const scope = layer.scopes.find((candidate) => candidate.id === layerRef.scopeId);
    if (!scope) {
      throw new Error(
        `SillyClaw v2 planner: stack references missing scope: ${layerRef.layerId}:${layerRef.scopeId}`,
      );
    }

    appendScopeEntries({
      stack: params.stack,
      layer,
      scope,
      sequence: baseSequence,
    });
  }

  const sequence = annotateSequence(baseSequence);
  return classifySequence({
    stack: params.stack,
    sequence,
  });
}

function appendScopeEntries(params: {
  stack: StackV2;
  layer: PresetLayerV2;
  scope: PromptScopeV2;
  sequence: ResolvedScopeEntryV2[];
}): void {
  const fragmentsById = new Map(params.layer.fragments.map((fragment) => [fragment.id, fragment]));
  const orderedEntries = params.scope.entries
    .filter((entry) => entry.enabled)
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal);

  for (const scopeEntry of orderedEntries) {
    const fragment = fragmentsById.get(scopeEntry.fragmentId);
    if (!fragment) {
      throw new Error(
        `SillyClaw v2 planner: scope references missing fragment: ${params.layer.id}:${params.scope.id}:${scopeEntry.fragmentId}`,
      );
    }

    const sequenceOrdinal = params.sequence.length;
    params.sequence.push(toResolvedScopeEntry({
      stackId: params.stack.id,
      layerId: params.layer.id,
      scopeId: params.scope.id,
      sequenceOrdinal,
      fragment,
    }));
  }
}

function toResolvedScopeEntry(params: {
  stackId: string;
  layerId: string;
  scopeId: string;
  sequenceOrdinal: number;
  fragment: PromptFragmentV2;
}): ResolvedScopeEntryV2 {
  return {
    key: `${params.layerId}:${params.scopeId}:${params.fragment.id}:${params.sequenceOrdinal}`,
    stackId: params.stackId,
    layerId: params.layerId,
    scopeId: params.scopeId,
    sequenceOrdinal: params.sequenceOrdinal,
    fragmentId: params.fragment.id,
    sourceIdentifier: params.fragment.sourceIdentifier,
    name: params.fragment.name,
    role: params.fragment.role,
    contentTemplate: params.fragment.contentTemplate,
    marker: params.fragment.marker,
    systemPrompt: params.fragment.systemPrompt,
    anchorBinding: params.fragment.anchorBinding,
    triggerPolicy: [...params.fragment.triggerPolicy],
    insertion: params.fragment.insertion,
    forbidOverrides: params.fragment.forbidOverrides,
    featureFlags: [...params.fragment.featureFlags],
    historySegment: "no-history",
    previousAnchorBinding: undefined,
    nextAnchorBinding: undefined,
  };
}

function annotateSequence(sequence: ResolvedScopeEntryV2[]): ResolvedScopeEntryV2[] {
  const hasHistoryAnchor = sequence.some(
    (entry) => entry.marker && entry.anchorBinding === "chat-history",
  );

  let previousAnchorBinding = undefined as ResolvedScopeEntryV2["previousAnchorBinding"];
  let historySeen = false;
  const annotated = sequence.map((entry) => {
    const historySegment = hasHistoryAnchor
      ? historySeen
        ? "after-history"
        : "before-history"
      : "no-history";
    const next = {
      ...entry,
      previousAnchorBinding,
      historySegment,
    } satisfies ResolvedScopeEntryV2;

    if (entry.marker && entry.anchorBinding) {
      previousAnchorBinding = entry.anchorBinding;
      if (entry.anchorBinding === "chat-history") {
        historySeen = true;
      }
    }

    return next;
  });

  let nextAnchorBinding = undefined as ResolvedScopeEntryV2["nextAnchorBinding"];
  for (let index = annotated.length - 1; index >= 0; index -= 1) {
    const entry = annotated[index];
    if (!entry) {
      continue;
    }
    entry.nextAnchorBinding = nextAnchorBinding;
    if (entry.marker && entry.anchorBinding) {
      nextAnchorBinding = entry.anchorBinding;
    }
  }

  return annotated;
}

function classifySequence(params: {
  stack: StackV2;
  sequence: ResolvedScopeEntryV2[];
}): RenderPlanV2 {
  const hookEnvelope: HookEnvelopeV2 = {
    prependSystem: [],
    appendSystem: [],
    prependContext: [],
  };
  const engineInsertions: EngineInsertionV2[] = [];
  const diagnostics: PlanDiagnosticV2[] = [];

  let prependWindowOpen = true;
  let postHistoryWindowOpen = false;

  for (const entry of params.sequence) {
    if (entry.marker) {
      prependWindowOpen = false;
      postHistoryWindowOpen = entry.anchorBinding === "chat-history";

      if (hasRenderableContent(entry)) {
        pushEngineRequired({
          stackId: params.stack.id,
          entry,
          reason: "marker-content-ignored",
          diagnostics,
          engineInsertions,
        });
      }

      continue;
    }

    if (!hasRenderableContent(entry)) {
      continue;
    }

    if (isPrependSystemCandidate(entry, prependWindowOpen)) {
      hookEnvelope.prependSystem.push(entry);
      continue;
    }
    prependWindowOpen = false;

    if (isPrependContextCandidate(entry, postHistoryWindowOpen)) {
      hookEnvelope.prependContext.push(entry);
      continue;
    }
    postHistoryWindowOpen = false;

    pushEngineRequired({
      stackId: params.stack.id,
      entry,
      reason: resolveEngineReason(entry),
      diagnostics,
      engineInsertions,
    });
  }

  return {
    stackId: params.stack.id,
    stackName: params.stack.name,
    preferredRenderer: params.stack.preferredRenderer,
    sequence: params.sequence,
    hookEnvelope,
    engineInsertions,
    diagnostics,
  };
}

function hasRenderableContent(entry: ResolvedScopeEntryV2): boolean {
  return entry.contentTemplate.trim().length > 0;
}

function isPrependSystemCandidate(
  entry: ResolvedScopeEntryV2,
  prependWindowOpen: boolean,
): boolean {
  return (
    prependWindowOpen &&
    entry.role === "system" &&
    entry.insertion.kind === "relative"
  );
}

function isPrependContextCandidate(
  entry: ResolvedScopeEntryV2,
  postHistoryWindowOpen: boolean,
): boolean {
  return (
    postHistoryWindowOpen &&
    entry.role === "system" &&
    entry.insertion.kind === "relative" &&
    entry.previousAnchorBinding === "chat-history"
  );
}

function resolveEngineReason(entry: ResolvedScopeEntryV2): PlanDiagnosticCodeV2 {
  if (entry.insertion.kind === "absolute") {
    return "engine-required-absolute-insertion";
  }
  if (entry.role !== "system") {
    return "engine-required-non-system-role";
  }
  if (
    (entry.previousAnchorBinding && entry.previousAnchorBinding !== "chat-history") ||
    (entry.nextAnchorBinding && entry.nextAnchorBinding !== "chat-history")
  ) {
    return "engine-required-anchor-relative";
  }
  return "engine-required-sequence-boundary";
}

function pushEngineRequired(params: {
  stackId: string;
  entry: ResolvedScopeEntryV2;
  reason: PlanDiagnosticCodeV2;
  diagnostics: PlanDiagnosticV2[];
  engineInsertions: EngineInsertionV2[];
}): void {
  params.engineInsertions.push({
    entry: params.entry,
    reason: params.reason,
  });
  params.diagnostics.push(buildPlanDiagnostic(params.stackId, params.entry, params.reason));
}

function buildPlanDiagnostic(
  stackId: string,
  entry: ResolvedScopeEntryV2,
  code: PlanDiagnosticCodeV2,
): PlanDiagnosticV2 {
  return {
    code,
    severity: resolveDiagnosticSeverity(code),
    message: buildDiagnosticMessage(entry, code),
    stackId,
    layerId: entry.layerId,
    scopeId: entry.scopeId,
    fragmentId: entry.fragmentId,
    entryKey: entry.key,
  };
}

function resolveDiagnosticSeverity(code: PlanDiagnosticCodeV2): DiagnosticSeverityV2 {
  return code === "marker-content-ignored" ? "warn" : "info";
}

function buildDiagnosticMessage(
  entry: ResolvedScopeEntryV2,
  code: PlanDiagnosticCodeV2,
): string {
  if (code === "marker-content-ignored") {
    return `Marker ${quote(entry.name)} carries body text and remains outside the hook envelope.`;
  }
  if (code === "engine-required-absolute-insertion") {
    const insertion = entry.insertion;
    if (insertion.kind !== "absolute") {
      throw new Error(`SillyClaw v2 planner: expected absolute insertion for ${entry.key}`);
    }
    return (
      `Fragment ${quote(entry.name)} requires absolute depth placement ` +
      `(depth=${insertion.depth}, order=${insertion.order}).`
    );
  }
  if (code === "engine-required-non-system-role") {
    return `Fragment ${quote(entry.name)} uses role ${entry.role} and cannot be rendered in the hook plane.`;
  }
  if (code === "engine-required-anchor-relative") {
    const anchor = entry.previousAnchorBinding ?? entry.nextAnchorBinding ?? "an internal anchor";
    return `Fragment ${quote(entry.name)} remains engine-required because it is anchored relative to ${anchor}.`;
  }
  return `Fragment ${quote(entry.name)} remains engine-required because a non-hookable boundary precedes it.`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}
