export type RecordValue = Record<string, unknown>;

export function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) {
    throw new Error(`SillyTavern v2 import: expected ${label} to be an object.`);
  }
  return value;
}

export function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`SillyTavern v2 import: expected ${label} to be an array.`);
  }
  return value;
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`SillyTavern v2 import: expected ${label} to be a string.`);
  }
  return value;
}

export function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`SillyTavern v2 import: expected ${label} to be a boolean.`);
  }
  return value;
}

export function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SillyTavern v2 import: expected ${label} to be a finite number.`);
  }
  return value;
}

export function extractPromptManagerContainer(raw: unknown): RecordValue {
  const root = asRecord(raw, "preset JSON");
  if (root.data !== undefined) {
    return asRecord(root.data, "preset JSON.data");
  }
  return root;
}
