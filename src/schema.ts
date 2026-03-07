import type {
  PresetBlock,
  PresetBlockMerge,
  PresetBlockTarget,
  PresetLayer,
  PresetLayerSource,
  PresetStack,
  SillyClawState,
} from "./types.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) {
    throw new Error(`SillyClaw schema: expected ${label} to be an object.`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`SillyClaw schema: expected ${label} to be a string.`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SillyClaw schema: expected ${label} to be a finite number.`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`SillyClaw schema: expected ${label} to be a boolean.`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`SillyClaw schema: expected ${label} to be an array.`);
  }
  return value;
}

function parseSchemaVersion(raw: RecordValue): 1 {
  const v = raw.schemaVersion;
  if (v === undefined) {
    return 1;
  }
  if (v !== 1) {
    throw new Error(`SillyClaw schema: unsupported schemaVersion: ${String(v)}`);
  }
  return 1;
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`SillyClaw schema: expected ${label} to be a string.`);
  }
  return value;
}

function parseOptionalStringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const rec = asRecord(value, label);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v !== "string") {
      throw new Error(`SillyClaw schema: expected ${label}.${k} to be a string.`);
    }
    out[k] = v;
  }
  return out;
}

export function parseSillyClawState(raw: unknown): SillyClawState {
  const r = asRecord(raw, "state");
  const schemaVersion = parseSchemaVersion(r);

  return {
    schemaVersion,
    defaultStackId: parseOptionalString(r.defaultStackId, "state.defaultStackId"),
    stackByAgentId: parseOptionalStringRecord(r.stackByAgentId, "stackByAgentId") ?? {},
    stackBySessionKey: parseOptionalStringRecord(r.stackBySessionKey, "stackBySessionKey") ?? {},
  };
}

export function parsePresetLayer(raw: unknown): PresetLayer {
  const r = asRecord(raw, "preset layer");
  const schemaVersion = parseSchemaVersion(r);

  const id = asString(r.id, "preset layer.id");
  const name = asString(r.name, "preset layer.name");
  const blocksRaw = asArray(r.blocks, "preset layer.blocks");
  const blocks = blocksRaw.map((b, i) => parsePresetBlock(b, `preset layer.blocks[${i}]`));

  const source = r.source === undefined ? undefined : parsePresetLayerSource(r.source);

  return { schemaVersion, id, name, source, blocks };
}

export function parsePresetStack(raw: unknown): PresetStack {
  const r = asRecord(raw, "preset stack");
  const schemaVersion = parseSchemaVersion(r);

  const id = asString(r.id, "preset stack.id");
  const name = asString(r.name, "preset stack.name");
  const layersRaw = asArray(r.layers, "preset stack.layers");
  const layers = layersRaw.map((v, i) => asString(v, `preset stack.layers[${i}]`));

  let macros: PresetStack["macros"];
  if (r.macros !== undefined) {
    const m = asRecord(r.macros, "preset stack.macros");
    macros = {
      char: parseOptionalString(m.char, "preset stack.macros.char"),
      user: parseOptionalString(m.user, "preset stack.macros.user"),
    };
  }

  return { schemaVersion, id, name, layers, macros };
}

function parsePresetBlock(raw: unknown, label: string): PresetBlock {
  const r = asRecord(raw, label);

  const target = parsePresetBlockTarget(r.target, `${label}.target`);
  const order = asNumber(r.order, `${label}.order`);
  const text = asString(r.text, `${label}.text`);

  let enabled: boolean | undefined;
  if (r.enabled !== undefined) {
    enabled = asBoolean(r.enabled, `${label}.enabled`);
  }

  const blockKey = parseOptionalString(r.blockKey, `${label}.blockKey`);

  let merge: PresetBlockMerge | undefined;
  if (r.merge !== undefined) {
    merge = parsePresetBlockMerge(r.merge, `${label}.merge`);
  }

  return { target, order, text, enabled, blockKey, merge };
}

function parsePresetBlockTarget(raw: unknown, label: string): PresetBlockTarget {
  const t = asString(raw, label);
  if (t === "system.prepend" || t === "system.append" || t === "user.prepend") {
    return t;
  }
  throw new Error(`SillyClaw schema: invalid ${label}: ${t}`);
}

function parsePresetBlockMerge(raw: unknown, label: string): PresetBlockMerge {
  const m = asString(raw, label);
  if (m === "concat" || m === "replace") {
    return m;
  }
  throw new Error(`SillyClaw schema: invalid ${label}: ${m}`);
}

function parsePresetLayerSource(raw: unknown): PresetLayerSource {
  const r = asRecord(raw, "preset layer.source");
  const kind = asString(r.kind, "preset layer.source.kind");

  if (kind === "sillytavern") {
    return {
      kind,
      fileName: parseOptionalString(r.fileName, "preset layer.source.fileName"),
      fileHashSha256: parseOptionalString(r.fileHashSha256, "preset layer.source.fileHashSha256"),
      importedAt: asString(r.importedAt, "preset layer.source.importedAt"),
    };
  }

  if (kind === "manual") {
    return {
      kind,
      createdAt: asString(r.createdAt, "preset layer.source.createdAt"),
    };
  }

  throw new Error(`SillyClaw schema: invalid preset layer.source.kind: ${kind}`);
}
