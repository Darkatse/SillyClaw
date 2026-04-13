import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  CompiledRegexRuleV2,
  PresetLayerV2,
  RegexArtifactV2,
  RegexPlacementV2,
  StackV2,
} from "./model.js";

export const SILLYCLAW_V2_REGEX_RENDERER_VERSION = "phase1";

const regexCache = new Map<string, RegExp>();

export function compileRegexArtifactV2(params: {
  stack: StackV2;
  layers: PresetLayerV2[];
}): RegexArtifactV2 | undefined {
  const layersById = new Map(params.layers.map((layer) => [layer.id, layer]));
  const seenLayerIds = new Set<string>();
  const rules: CompiledRegexRuleV2[] = [];

  for (const layerRef of params.stack.layers) {
    if (seenLayerIds.has(layerRef.layerId)) {
      continue;
    }
    seenLayerIds.add(layerRef.layerId);

    const layer = layersById.get(layerRef.layerId);
    if (!layer) {
      throw new Error(`SillyClaw v2 regex compile: missing layer: ${layerRef.layerId}`);
    }

    for (const rule of layer.regexRules) {
      if (rule.disabled) {
        continue;
      }

      rules.push({
        ...rule,
        key: `${params.stack.id}:${layer.id}:${rule.id}:${rules.length}`,
        stackId: params.stack.id,
        layerId: layer.id,
        ruleId: rule.id,
      });
    }
  }

  if (rules.length === 0) {
    return undefined;
  }

  return { rules };
}

export function applyRegexArtifactV2(params: {
  artifact?: RegexArtifactV2;
  messages: AgentMessage[];
}): AgentMessage[] {
  if (!params.artifact || params.artifact.rules.length === 0) {
    return params.messages;
  }

  let changed = false;
  const nextMessages = params.messages.map((message, index) => {
    const depth = params.messages.length - index - 1;
    const nextMessage = applyRulesToMessage(message, params.artifact!.rules, depth);
    if (nextMessage !== message) {
      changed = true;
    }
    return nextMessage;
  });

  return changed ? nextMessages : params.messages;
}

export function assertValidRegexStringV2(regexString: string): void {
  const parsed = regexFromStringV2(regexString);
  if (!parsed) {
    throw new Error(`SillyClaw v2 regex: invalid regex string: ${regexString}`);
  }
}

function applyRulesToMessage(
  message: AgentMessage,
  rules: CompiledRegexRuleV2[],
  depth: number,
): AgentMessage {
  const placement = resolveMessagePlacement(message);
  if (!placement) {
    return message;
  }

  const applicableRules = rules.filter((rule) => isRuleApplicable(rule, placement, depth));
  if (applicableRules.length === 0) {
    return message;
  }

  if (typeof message.content === "string") {
    const nextContent = applyRulesToText(message.content, applicableRules);
    return nextContent === message.content ? message : ({ ...message, content: nextContent } as AgentMessage);
  }

  if (!Array.isArray(message.content)) {
    return message;
  }

  let changed = false;
  const nextContent = message.content.map((block) => {
    if (!block || typeof block !== "object" || (block as { type?: unknown }).type !== "text") {
      return block;
    }

    const text = (block as { text?: unknown }).text;
    if (typeof text !== "string") {
      return block;
    }

    const nextText = applyRulesToText(text, applicableRules);
    if (nextText === text) {
      return block;
    }

    changed = true;
    return {
      ...block,
      text: nextText,
    };
  });

  return changed ? ({ ...message, content: nextContent } as AgentMessage) : message;
}

function resolveMessagePlacement(message: AgentMessage): RegexPlacementV2 | undefined {
  if (message.role === "user") {
    return "user-input";
  }
  if (message.role === "assistant") {
    return "ai-output";
  }
  return undefined;
}

function isRuleApplicable(
  rule: CompiledRegexRuleV2,
  placement: RegexPlacementV2,
  depth: number,
): boolean {
  if (!rule.placements.includes(placement)) {
    return false;
  }
  if (rule.minDepth !== undefined && depth < rule.minDepth) {
    return false;
  }
  if (rule.maxDepth !== undefined && depth > rule.maxDepth) {
    return false;
  }
  return true;
}

function applyRulesToText(text: string, rules: CompiledRegexRuleV2[]): string {
  let nextText = text;
  for (const rule of rules) {
    const regex = regexFromStringV2(rule.findRegex);
    if (!regex) {
      throw new Error(`SillyClaw v2 regex: invalid compiled regex string: ${rule.findRegex}`);
    }
    nextText = nextText.replace(regex, normalizeReplaceString(rule.replaceString));
  }
  return nextText;
}

function normalizeReplaceString(replaceString: string): string {
  return replaceString.replace(/\{\{match\}\}/giu, "$$&");
}

function regexFromStringV2(input: string): RegExp | undefined {
  const cached = regexCache.get(input);
  if (cached) {
    resetRegexLastIndex(cached);
    return cached;
  }

  try {
    const match = input.match(/(\/?)(.+)\1([a-z]*)/i);
    if (!match) {
      return undefined;
    }

    const [, , source, flags] = match;
    if (!source) {
      return undefined;
    }
    if (flags && !/^(?!.*?(.).*?\1)[dgimsuvy]*$/u.test(flags)) {
      return new RegExp(input);
    }

    const parsed = new RegExp(source, flags);
    regexCache.set(input, parsed);
    resetRegexLastIndex(parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function resetRegexLastIndex(regex: RegExp): void {
  if (regex.global || regex.sticky) {
    regex.lastIndex = 0;
  }
}
