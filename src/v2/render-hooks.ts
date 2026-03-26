import type { HookArtifactV2, HookPromptInjectionV2, RenderPlanV2, ResolvedScopeEntryV2 } from "./model.js";

export const SILLYCLAW_V2_HOOK_RENDERER_VERSION = "phase3";

export function renderHookArtifactV2(plan: RenderPlanV2): HookArtifactV2 {
  return {
    injection: renderHookInjection(plan),
    entryKeys: {
      prependSystem: plan.hookEnvelope.prependSystem.map((entry) => entry.key),
      appendSystem: plan.hookEnvelope.appendSystem.map((entry) => entry.key),
      prependContext: plan.hookEnvelope.prependContext.map((entry) => entry.key),
    },
  };
}

export function renderHookInjection(plan: RenderPlanV2): HookPromptInjectionV2 {
  return compactInjection({
    prependSystemContext: joinEntries(plan.hookEnvelope.prependSystem),
    appendSystemContext: joinEntries(plan.hookEnvelope.appendSystem),
    prependContext: joinEntries(plan.hookEnvelope.prependContext),
  });
}

function joinEntries(entries: ResolvedScopeEntryV2[]): string | undefined {
  const parts = entries
    .map((entry) => entry.contentTemplate)
    .filter((content) => content.trim().length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}

function compactInjection(injection: HookPromptInjectionV2): HookPromptInjectionV2 {
  const compact: HookPromptInjectionV2 = {};
  if (injection.prependSystemContext) {
    compact.prependSystemContext = injection.prependSystemContext;
  }
  if (injection.appendSystemContext) {
    compact.appendSystemContext = injection.appendSystemContext;
  }
  if (injection.prependContext) {
    compact.prependContext = injection.prependContext;
  }
  return compact;
}
