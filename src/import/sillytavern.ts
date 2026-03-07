import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PresetBlock, PresetBlockTarget, PresetLayer } from "../types.js";

type StPrompt = {
  identifier: string;
  name?: string;
  role?: string;
  content?: string;
  marker?: boolean;
  system_prompt?: boolean;
};

type StPromptOrderEntry = {
  identifier: string;
  enabled: boolean;
};

type StPromptOrderList = Array<{
  character_id: number;
  order: StPromptOrderEntry[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`SillyTavern import: expected ${label} to be an object.`);
  }
  return value;
}

function getArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`SillyTavern import: expected ${label} to be an array.`);
  }
  return value;
}

function getString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`SillyTavern import: expected ${label} to be a string.`);
  }
  return value;
}

function getBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`SillyTavern import: expected ${label} to be a boolean.`);
  }
  return value;
}

function extractPromptManagerContainer(raw: unknown): Record<string, unknown> {
  const root = getRecord(raw, "preset JSON");
  if (Object.hasOwn(root, "data")) {
    const data = root.data;
    if (data !== undefined) {
      return getRecord(data, "preset JSON.data");
    }
  }
  return root;
}

function parsePrompts(container: Record<string, unknown>): StPrompt[] {
  const promptsRaw = getArray(container.prompts, "prompts");
  return promptsRaw.map((p, i) => {
    const rec = getRecord(p, `prompts[${i}]`);
    const identifier = getString(rec.identifier, `prompts[${i}].identifier`);
    const name = typeof rec.name === "string" ? rec.name : undefined;
    const role = typeof rec.role === "string" ? rec.role : undefined;
    const content = typeof rec.content === "string" ? rec.content : undefined;
    const marker = typeof rec.marker === "boolean" ? rec.marker : undefined;
    const system_prompt = typeof rec.system_prompt === "boolean" ? rec.system_prompt : undefined;
    return { identifier, name, role, content, marker, system_prompt };
  });
}

function parsePromptOrder(container: Record<string, unknown>): StPromptOrderEntry[] {
  const poRaw = getArray(container.prompt_order, "prompt_order");

  const first = poRaw[0];
  if (first === undefined) {
    return [];
  }

  const firstRec = getRecord(first, "prompt_order[0]");
  if (Object.hasOwn(firstRec, "identifier")) {
    // PromptManager export format: prompt_order is directly the order list.
    return poRaw.map((e, i) => {
      const rec = getRecord(e, `prompt_order[${i}]`);
      const identifier = getString(rec.identifier, `prompt_order[${i}].identifier`);
      const enabled = getBoolean(rec.enabled, `prompt_order[${i}].enabled`);
      return { identifier, enabled };
    });
  }

  if (Object.hasOwn(firstRec, "character_id")) {
    // OpenAI preset format: prompt_order is a list of per-character order lists.
    const lists = poRaw.map((e, i) => {
      const rec = getRecord(e, `prompt_order[${i}]`);
      const character_id = Number(rec.character_id);
      if (!Number.isFinite(character_id)) {
        throw new Error(`SillyTavern import: expected prompt_order[${i}].character_id to be a number.`);
      }
      const orderRaw = getArray(rec.order, `prompt_order[${i}].order`);
      const order = orderRaw.map((oe, j) => {
        const orec = getRecord(oe, `prompt_order[${i}].order[${j}]`);
        const identifier = getString(orec.identifier, `prompt_order[${i}].order[${j}].identifier`);
        const enabled = getBoolean(orec.enabled, `prompt_order[${i}].order[${j}].enabled`);
        return { identifier, enabled };
      });
      return { character_id, order };
    }) satisfies StPromptOrderList;

    const preferred = lists.find((x) => x.character_id === 100001) ?? lists.find((x) => x.character_id === 100000);
    return (preferred ?? lists[0])?.order ?? [];
  }

  throw new Error("SillyTavern import: unsupported prompt_order format.");
}

export type ImportSillyTavernPresetParams = {
  raw: unknown;
  id?: string;
  /**
   * Used as the stored preset name in SillyClaw.
   * Recommended: file basename without extension.
   */
  name: string;
  sourceFileName?: string;
  importedAt?: string;
  sourceFileHashSha256?: string;
  /**
   * Where to place the SillyTavern `main` prompt (identifier `main`).
   * Default: `system.prepend`.
   */
  mainTarget?: PresetBlockTarget;
};

export function importSillyTavernPreset(params: ImportSillyTavernPresetParams): PresetLayer {
  const container = extractPromptManagerContainer(params.raw);
  const prompts = parsePrompts(container);
  const promptOrder = parsePromptOrder(container);

  const promptsById = new Map(prompts.map((p) => [p.identifier, p]));

  const mainIndex = promptOrder.findIndex((e) => e.identifier === "main");
  const chatHistoryIndex = promptOrder.findIndex((e) => e.identifier === "chatHistory");

  const mainTarget: PresetBlockTarget = params.mainTarget ?? "system.prepend";
  const blocks: PresetBlock[] = [];

  for (let i = 0; i < promptOrder.length; i++) {
    const entry = promptOrder[i]!;
    const prompt = promptsById.get(entry.identifier);
    if (!prompt) {
      continue;
    }

    if (prompt.marker === true) {
      continue;
    }

    const text = prompt.content ?? "";
    const target = resolveTarget({
      identifier: entry.identifier,
      index: i,
      mainIndex,
      chatHistoryIndex,
      mainTarget,
    });

    blocks.push({
      target,
      order: i,
      text,
      enabled: entry.enabled,
      blockKey: entry.identifier,
    });
  }

  const importedAt = params.importedAt ?? new Date().toISOString();

  return {
    schemaVersion: 1,
    id: params.id ?? randomUUID(),
    name: params.name || path.parse(params.sourceFileName ?? "import").name,
    source: {
      kind: "sillytavern",
      fileName: params.sourceFileName,
      fileHashSha256: params.sourceFileHashSha256,
      importedAt,
    },
    blocks,
  };
}

function resolveTarget(params: {
  identifier: string;
  index: number;
  mainIndex: number;
  chatHistoryIndex: number;
  mainTarget: PresetBlockTarget;
}): PresetBlockTarget {
  if (params.identifier === "main") {
    return params.mainTarget;
  }

  // “After chat history” maps to user-space overlay.
  if (params.chatHistoryIndex >= 0 && params.index > params.chatHistoryIndex) {
    return "user.prepend";
  }

  // Default: system-space overlay.
  return "system.prepend";
}
