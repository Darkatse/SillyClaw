import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf-8");
  await fs.rename(tmpPath, filePath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function sha256OfJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf-8").digest("hex");
}
