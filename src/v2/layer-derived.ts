import type {
  ImportDiagnosticV2,
  PresetLayerV2,
  PromptFeatureFlagV2,
  PromptFragmentV2,
  PromptScopeEntryV2,
  RendererPreferenceV2,
  StackV2,
} from "./model.js";

export function detectFeatureFlagsV2(content: string): PromptFeatureFlagV2[] {
  const flags = new Set<PromptFeatureFlagV2>();
  if (/\{\{setvar::/u.test(content)) {
    flags.add("contains-setvar");
  }
  if (/\{\{getvar::/u.test(content)) {
    flags.add("contains-getvar");
  }
  if (/\{\{\/\//u.test(content)) {
    flags.add("contains-comment-macro");
  }
  if (/<regex\b/u.test(content)) {
    flags.add("contains-regex-tag");
  }
  if (/<\|no-trans\|>/u.test(content)) {
    flags.add("contains-no-trans-tag");
  }
  if (/<think>/u.test(content)) {
    flags.add("contains-think-tag");
  }
  return [...flags];
}

export function resolveScopePreferredRendererV2(
  entries: PromptScopeEntryV2[],
  fragmentsById: Map<string, PromptFragmentV2>,
): RendererPreferenceV2 {
  const enabledFragments = entries
    .filter((entry) => entry.enabled)
    .map((entry) => fragmentsById.get(entry.fragmentId))
    .filter((fragment): fragment is PromptFragmentV2 => fragment !== undefined);

  const hasAbsoluteInsertions = enabledFragments.some((fragment) => fragment.insertion.kind === "absolute");
  const hasNonSystemRoles = enabledFragments.some((fragment) => !fragment.marker && fragment.role !== "system");
  if (hasAbsoluteInsertions || hasNonSystemRoles) {
    return "context-engine";
  }

  const touchesHistory = enabledFragments.some((fragment) => fragment.anchorBinding === "chat-history");
  return touchesHistory ? "hybrid" : "hooks";
}

export function finalizeLayerV2(layer: PresetLayerV2): PresetLayerV2 {
  const fragments = layer.fragments.map((fragment) => ({
    ...fragment,
    featureFlags: detectFeatureFlagsV2(fragment.contentTemplate),
  }));
  const fragmentsById = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const scopes = layer.scopes.map((scope) => ({
    ...scope,
    preferredRenderer: resolveScopePreferredRendererV2(scope.entries, fragmentsById),
  }));
  const featureSummary = [...new Set(fragments.flatMap((fragment) => fragment.featureFlags))];
  const nextLayer = {
    ...layer,
    fragments,
    scopes,
    featureSummary,
  };

  return {
    ...nextLayer,
    diagnostics: buildLayerDiagnosticsV2(nextLayer),
  };
}

export function resolveStackPreferredRendererV2(params: {
  stack: StackV2;
  layers: PresetLayerV2[];
}): RendererPreferenceV2 {
  const layersById = new Map(params.layers.map((layer) => [layer.id, layer]));
  const preferences = params.stack.layers.map((layerRef) => {
    const layer = layersById.get(layerRef.layerId);
    if (!layer) {
      throw new Error(`SillyClaw v2 stack derivation: missing layer: ${layerRef.layerId}`);
    }

    const scope = layer.scopes.find((candidate) => candidate.id === layerRef.scopeId);
    if (!scope) {
      throw new Error(`SillyClaw v2 stack derivation: missing scope: ${layerRef.layerId}:${layerRef.scopeId}`);
    }

    return scope.preferredRenderer;
  });

  if (preferences.includes("context-engine")) {
    return "context-engine";
  }
  if (preferences.includes("hybrid")) {
    return "hybrid";
  }
  return "hooks";
}

function buildLayerDiagnosticsV2(layer: PresetLayerV2): ImportDiagnosticV2[] {
  const diagnostics: ImportDiagnosticV2[] = [];

  if (layer.scopes.length > 1) {
    diagnostics.push({
      code: "multiple-scopes",
      severity: "info",
      message: `Imported ${layer.scopes.length} prompt-order scopes from the source preset.`,
    });
  }

  if (layer.featureSummary.length > 0) {
    diagnostics.push({
      code: "unsupported-syntax",
      severity: "warn",
      message: `Imported unsupported SillyTavern syntax as opaque text: ${layer.featureSummary.join(", ")}.`,
    });
  }

  const fragmentsById = new Map(layer.fragments.map((fragment) => [fragment.id, fragment]));
  for (const scope of layer.scopes) {
    const enabledFragments = scope.entries
      .filter((entry) => entry.enabled)
      .map((entry) => fragmentsById.get(entry.fragmentId))
      .filter((fragment): fragment is PromptFragmentV2 => fragment !== undefined);

    const roles = new Set(enabledFragments.filter((fragment) => !fragment.marker).map((fragment) => fragment.role));
    if (roles.has("user") || roles.has("assistant")) {
      diagnostics.push({
        code: "mixed-roles",
        severity: "info",
        scopeId: scope.id,
        message: `Scope ${scope.id} contains non-system prompt roles and should be planned on the context-engine path.`,
      });
    }

    if (enabledFragments.some((fragment) => fragment.insertion.kind === "absolute")) {
      diagnostics.push({
        code: "absolute-insertions",
        severity: "info",
        scopeId: scope.id,
        message: `Scope ${scope.id} contains absolute depth insertions.`,
      });
    }
  }

  return diagnostics;
}
