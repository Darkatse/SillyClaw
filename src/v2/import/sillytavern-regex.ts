import type {
  PresetLayerSourceV2,
  RegexImportSummaryV2,
  RegexPlacementV2,
  RegexRuleV2,
} from "../model.js";
import { assertValidRegexStringV2 } from "../regex.js";
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  extractPromptManagerContainer,
} from "./sillytavern-shared.js";

const ST_REGEX_USER_INPUT = 1;
const ST_REGEX_AI_OUTPUT = 2;

type StRegexRule = {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  substituteRegex: number;
  minDepth?: number;
  maxDepth?: number;
};

export type ImportedRegexBundleV2 = {
  source?: PresetLayerSourceV2;
  rules: RegexRuleV2[];
  summary: RegexImportSummaryV2;
};

export type ImportSillyTavernRegexRulesV2Params = {
  raw: unknown;
  source?: PresetLayerSourceV2;
};

export function importSillyTavernRegexRulesV2(
  params: ImportSillyTavernRegexRulesV2Params,
): ImportedRegexBundleV2 {
  const container = extractPromptManagerContainer(params.raw);
  const rules = parseRegexRules(container);
  const imported: RegexRuleV2[] = [];
  const summary: RegexImportSummaryV2 = {
    importedCount: 0,
    skippedMarkdownOnlyCount: 0,
    skippedNonPromptOnlyCount: 0,
    skippedUnsupportedPlacementCount: 0,
    skippedUnsupportedSubstitutionCount: 0,
    skippedUnsupportedTrimCount: 0,
  };

  for (const rule of rules) {
    if (rule.markdownOnly) {
      summary.skippedMarkdownOnlyCount += 1;
      continue;
    }
    if (!rule.promptOnly) {
      summary.skippedNonPromptOnlyCount += 1;
      continue;
    }
    if (rule.substituteRegex !== 0) {
      summary.skippedUnsupportedSubstitutionCount += 1;
      continue;
    }
    if (rule.trimStrings.length > 0) {
      summary.skippedUnsupportedTrimCount += 1;
      continue;
    }

    const placements = normalizePlacements(rule.placement);
    if (!placements) {
      summary.skippedUnsupportedPlacementCount += 1;
      continue;
    }

    assertValidRegexStringV2(rule.findRegex);

    imported.push({
      id: rule.id,
      name: rule.scriptName,
      findRegex: rule.findRegex,
      replaceString: rule.replaceString,
      placements,
      disabled: rule.disabled,
      minDepth: rule.minDepth,
      maxDepth: rule.maxDepth,
    });
    summary.importedCount += 1;
  }

  return {
    source: params.source,
    rules: imported,
    summary,
  };
}

function parseRegexRules(container: Record<string, unknown>): StRegexRule[] {
  const extensions =
    container.extensions === undefined ? undefined : asRecord(container.extensions, "preset JSON.extensions");
  if (!extensions || extensions.regex_scripts === undefined) {
    return [];
  }

  return asArray(extensions.regex_scripts, "preset JSON.extensions.regex_scripts").map((item, index) =>
    parseRegexRule(item, `preset JSON.extensions.regex_scripts[${index}]`),
  );
}

function parseRegexRule(value: unknown, label: string): StRegexRule {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    scriptName: typeof record.scriptName === "string" ? record.scriptName : asString(record.id, `${label}.id`),
    findRegex: asString(record.findRegex, `${label}.findRegex`),
    replaceString: asString(record.replaceString, `${label}.replaceString`),
    trimStrings:
      record.trimStrings === undefined
        ? []
        : asArray(record.trimStrings, `${label}.trimStrings`).map((item, index) =>
            asString(item, `${label}.trimStrings[${index}]`),
          ),
    placement: asArray(record.placement, `${label}.placement`).map((item, index) =>
      asNumber(item, `${label}.placement[${index}]`),
    ),
    disabled: record.disabled === undefined ? false : asBoolean(record.disabled, `${label}.disabled`),
    markdownOnly:
      record.markdownOnly === undefined ? false : asBoolean(record.markdownOnly, `${label}.markdownOnly`),
    promptOnly: record.promptOnly === undefined ? false : asBoolean(record.promptOnly, `${label}.promptOnly`),
    substituteRegex:
      record.substituteRegex === undefined ? 0 : asNumber(record.substituteRegex, `${label}.substituteRegex`),
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

function normalizePlacements(raw: number[]): RegexPlacementV2[] | undefined {
  const placements = new Set<RegexPlacementV2>();
  for (const placement of raw) {
    if (placement === ST_REGEX_USER_INPUT) {
      placements.add("user-input");
      continue;
    }
    if (placement === ST_REGEX_AI_OUTPUT) {
      placements.add("ai-output");
      continue;
    }
    return undefined;
  }

  if (placements.size === 0) {
    return undefined;
  }

  return [...placements];
}
