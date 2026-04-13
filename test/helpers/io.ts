import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function writeJsonFixture(dataDir: string, fileName: string, raw: unknown): Promise<string> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf-8");
  return filePath;
}
