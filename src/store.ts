import fs from "node:fs/promises";
import path from "node:path";
import type { PresetLayer, PresetStack, SillyClawState } from "./types.js";

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class SillyClawStore {
  readonly dataDir: string;

  constructor(params: { dataDir: string }) {
    this.dataDir = params.dataDir;
  }

  private statePath(): string {
    return path.join(this.dataDir, "state.json");
  }

  private presetsDir(): string {
    return path.join(this.dataDir, "presets");
  }

  private stacksDir(): string {
    return path.join(this.dataDir, "stacks");
  }

  presetPath(id: string): string {
    return path.join(this.presetsDir(), `${id}.json`);
  }

  stackPath(id: string): string {
    return path.join(this.stacksDir(), `${id}.json`);
  }

  async loadState(): Promise<SillyClawState> {
    const p = this.statePath();
    if (!(await fileExists(p))) {
      return { schemaVersion: 1, stackByAgentId: {}, stackBySessionKey: {} };
    }
    return await readJsonFile<SillyClawState>(p);
  }

  async saveState(state: SillyClawState): Promise<void> {
    await writeJsonFileAtomic(this.statePath(), state);
  }

  async savePreset(preset: PresetLayer): Promise<void> {
    await writeJsonFileAtomic(this.presetPath(preset.id), preset);
  }

  async deletePreset(id: string): Promise<void> {
    await fs.unlink(this.presetPath(id));
  }

  async loadPreset(id: string): Promise<PresetLayer> {
    return await readJsonFile<PresetLayer>(this.presetPath(id));
  }

  async listPresets(): Promise<PresetLayer[]> {
    const dir = this.presetsDir();
    if (!(await fileExists(dir))) {
      return [];
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: PresetLayer[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) {
        continue;
      }
      if (!ent.name.endsWith(".json")) {
        continue;
      }
      out.push(await readJsonFile<PresetLayer>(path.join(dir, ent.name)));
    }
    return out;
  }

  async saveStack(stack: PresetStack): Promise<void> {
    await writeJsonFileAtomic(this.stackPath(stack.id), stack);
  }

  async deleteStack(id: string): Promise<void> {
    await fs.unlink(this.stackPath(id));
  }

  async loadStack(id: string): Promise<PresetStack> {
    return await readJsonFile<PresetStack>(this.stackPath(id));
  }

  async listStacks(): Promise<PresetStack[]> {
    const dir = this.stacksDir();
    if (!(await fileExists(dir))) {
      return [];
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: PresetStack[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) {
        continue;
      }
      if (!ent.name.endsWith(".json")) {
        continue;
      }
      out.push(await readJsonFile<PresetStack>(path.join(dir, ent.name)));
    }
    return out;
  }
}
