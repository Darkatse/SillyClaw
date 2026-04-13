import type {
  PresetLayerSourceV2,
  PresetLayerV2,
  PromptInsertionV2,
  PromptScopeV2,
  RegexRuleV2,
} from "./model.js";

export function setScopeEntryEnabledV2(params: {
  layer: PresetLayerV2;
  scopeId: string;
  fragmentId: string;
  enabled: boolean;
}): PresetLayerV2 {
  const scope = requireScope(params.layer, params.scopeId);
  requireScopeEntry(scope, params.fragmentId);

  return {
    ...params.layer,
    scopes: params.layer.scopes.map((candidate) =>
      candidate.id !== params.scopeId
        ? candidate
        : {
            ...candidate,
            entries: candidate.entries.map((entry) =>
              entry.fragmentId !== params.fragmentId ? entry : { ...entry, enabled: params.enabled },
            ),
          },
    ),
  };
}

export function moveScopeEntryV2(params: {
  layer: PresetLayerV2;
  scopeId: string;
  fragmentId: string;
  beforeFragmentId?: string;
  afterFragmentId?: string;
}): PresetLayerV2 {
  const moveModeCount = Number(params.beforeFragmentId !== undefined) + Number(params.afterFragmentId !== undefined);
  if (moveModeCount !== 1) {
    throw new Error("SillyClaw v2 layer mutation: use exactly one of beforeFragmentId or afterFragmentId.");
  }

  const scope = requireScope(params.layer, params.scopeId);
  const orderedEntries = scope.entries.slice().sort((left, right) => left.ordinal - right.ordinal);
  const sourceIndex = orderedEntries.findIndex((entry) => entry.fragmentId === params.fragmentId);
  if (sourceIndex < 0) {
    throw new Error(`SillyClaw v2 layer mutation: missing scope entry: ${params.scopeId}:${params.fragmentId}`);
  }

  const targetFragmentId = params.beforeFragmentId ?? params.afterFragmentId!;
  if (targetFragmentId === params.fragmentId) {
    throw new Error("SillyClaw v2 layer mutation: move target must differ from the source fragment.");
  }

  const targetIndex = orderedEntries.findIndex((entry) => entry.fragmentId === targetFragmentId);
  if (targetIndex < 0) {
    throw new Error(`SillyClaw v2 layer mutation: missing scope entry: ${params.scopeId}:${targetFragmentId}`);
  }

  const movingEntry = orderedEntries[sourceIndex]!;
  const withoutSource = orderedEntries.filter((entry) => entry.fragmentId !== params.fragmentId);
  const reducedTargetIndex = withoutSource.findIndex((entry) => entry.fragmentId === targetFragmentId);
  const insertionIndex = params.beforeFragmentId !== undefined ? reducedTargetIndex : reducedTargetIndex + 1;
  const reordered = [
    ...withoutSource.slice(0, insertionIndex),
    movingEntry,
    ...withoutSource.slice(insertionIndex),
  ].map((entry, ordinal) => ({
    ...entry,
    ordinal,
  }));

  return {
    ...params.layer,
    scopes: params.layer.scopes.map((candidate) =>
      candidate.id !== params.scopeId ? candidate : { ...candidate, entries: reordered },
    ),
  };
}

export function setFragmentContentV2(params: {
  layer: PresetLayerV2;
  fragmentId: string;
  content: string;
}): PresetLayerV2 {
  requireFragment(params.layer, params.fragmentId);

  return {
    ...params.layer,
    fragments: params.layer.fragments.map((fragment) =>
      fragment.id !== params.fragmentId ? fragment : { ...fragment, contentTemplate: params.content },
    ),
  };
}

export function setFragmentInsertionV2(params: {
  layer: PresetLayerV2;
  fragmentId: string;
  insertion: PromptInsertionV2;
}): PresetLayerV2 {
  requireFragment(params.layer, params.fragmentId);

  return {
    ...params.layer,
    fragments: params.layer.fragments.map((fragment) =>
      fragment.id !== params.fragmentId ? fragment : { ...fragment, insertion: params.insertion },
    ),
  };
}

export function replaceLayerRegexRulesV2(params: {
  layer: PresetLayerV2;
  regexSource?: PresetLayerSourceV2;
  regexRules: RegexRuleV2[];
}): PresetLayerV2 {
  return {
    ...params.layer,
    regexSource: params.regexSource,
    regexRules: params.regexRules.slice(),
  };
}

export function setRegexRuleEnabledV2(params: {
  layer: PresetLayerV2;
  ruleId: string;
  enabled: boolean;
}): PresetLayerV2 {
  requireRegexRule(params.layer, params.ruleId);

  return {
    ...params.layer,
    regexRules: params.layer.regexRules.map((rule) =>
      rule.id !== params.ruleId ? rule : { ...rule, disabled: !params.enabled },
    ),
  };
}

export function moveRegexRuleV2(params: {
  layer: PresetLayerV2;
  ruleId: string;
  beforeRuleId?: string;
  afterRuleId?: string;
}): PresetLayerV2 {
  const moveModeCount = Number(params.beforeRuleId !== undefined) + Number(params.afterRuleId !== undefined);
  if (moveModeCount !== 1) {
    throw new Error("SillyClaw v2 layer mutation: use exactly one of beforeRuleId or afterRuleId.");
  }

  const sourceIndex = params.layer.regexRules.findIndex((rule) => rule.id === params.ruleId);
  if (sourceIndex < 0) {
    throw new Error(`SillyClaw v2 layer mutation: missing regex rule: ${params.layer.id}:${params.ruleId}`);
  }

  const targetRuleId = params.beforeRuleId ?? params.afterRuleId!;
  if (targetRuleId === params.ruleId) {
    throw new Error("SillyClaw v2 layer mutation: move target must differ from the source regex rule.");
  }

  const targetIndex = params.layer.regexRules.findIndex((rule) => rule.id === targetRuleId);
  if (targetIndex < 0) {
    throw new Error(`SillyClaw v2 layer mutation: missing regex rule: ${params.layer.id}:${targetRuleId}`);
  }

  const movingRule = params.layer.regexRules[sourceIndex]!;
  const withoutSource = params.layer.regexRules.filter((rule) => rule.id !== params.ruleId);
  const reducedTargetIndex = withoutSource.findIndex((rule) => rule.id === targetRuleId);
  const insertionIndex = params.beforeRuleId !== undefined ? reducedTargetIndex : reducedTargetIndex + 1;

  return {
    ...params.layer,
    regexRules: [
      ...withoutSource.slice(0, insertionIndex),
      movingRule,
      ...withoutSource.slice(insertionIndex),
    ],
  };
}

function requireScope(layer: PresetLayerV2, scopeId: string): PromptScopeV2 {
  const scope = layer.scopes.find((candidate) => candidate.id === scopeId);
  if (!scope) {
    throw new Error(`SillyClaw v2 layer mutation: missing scope: ${layer.id}:${scopeId}`);
  }
  return scope;
}

function requireScopeEntry(scope: PromptScopeV2, fragmentId: string): void {
  if (!scope.entries.some((entry) => entry.fragmentId === fragmentId)) {
    throw new Error(`SillyClaw v2 layer mutation: missing scope entry: ${scope.id}:${fragmentId}`);
  }
}

function requireFragment(layer: PresetLayerV2, fragmentId: string): void {
  if (!layer.fragments.some((fragment) => fragment.id === fragmentId)) {
    throw new Error(`SillyClaw v2 layer mutation: missing fragment: ${layer.id}:${fragmentId}`);
  }
}

function requireRegexRule(layer: PresetLayerV2, ruleId: string): void {
  if (!layer.regexRules.some((rule) => rule.id === ruleId)) {
    throw new Error(`SillyClaw v2 layer mutation: missing regex rule: ${layer.id}:${ruleId}`);
  }
}
