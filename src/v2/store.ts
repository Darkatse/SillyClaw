import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJsonFile, sha256OfJson, writeJsonFileAtomic } from "../io.js";
import type {
  DiagnosticCodeV2,
  ImportedPresetBundleV2,
  LayerIndexEntryV2,
  PresetLayerV2,
  SillyClawStateV2,
  StackArtifactV2,
  StackIndexEntryV2,
  StackV2,
} from "./model.js";
import { SILLYCLAW_V2_SCHEMA_VERSION } from "./model.js";
import { summarizePlacementV2 } from "./observability.js";
import {
  parseLayerIndexEntryV2,
  parsePresetLayerV2,
  parseStackArtifactV2,
  parseStackIndexEntryV2,
  parseStackV2,
  parseStateV2,
} from "./schema.js";

export class SillyClawV2Store {
  readonly dataDir: string;

  constructor(params: { dataDir: string }) {
    this.dataDir = path.join(params.dataDir, "v2");
  }

  private statePath(): string {
    return path.join(this.dataDir, "state.json");
  }

  private indexesDir(): string {
    return path.join(this.dataDir, "indexes");
  }

  private layersIndexPath(): string {
    return path.join(this.indexesDir(), "layers.json");
  }

  private stacksIndexPath(): string {
    return path.join(this.indexesDir(), "stacks.json");
  }

  private layersDir(): string {
    return path.join(this.dataDir, "layers");
  }

  private stacksDir(): string {
    return path.join(this.dataDir, "stacks");
  }

  private artifactsDir(): string {
    return path.join(this.dataDir, "artifacts");
  }

  layerPath(id: string): string {
    return path.join(this.layersDir(), `${id}.json`);
  }

  stackPath(id: string): string {
    return path.join(this.stacksDir(), `${id}.json`);
  }

  artifactPath(key: string): string {
    return path.join(this.artifactsDir(), `${key}.json`);
  }

  async loadState(): Promise<SillyClawStateV2> {
    const statePath = this.statePath();
    if (!(await fileExists(statePath))) {
      return {
        schemaVersion: SILLYCLAW_V2_SCHEMA_VERSION,
        stackByAgentId: {},
        stackBySessionKey: {},
      };
    }
    return parseStateV2(await readJsonFile(statePath));
  }

  async saveState(state: SillyClawStateV2): Promise<void> {
    await writeJsonFileAtomic(this.statePath(), state);
  }

  async saveLayer(layer: PresetLayerV2): Promise<void> {
    await writeJsonFileAtomic(this.layerPath(layer.id), layer);
    await this.upsertLayerIndex(buildLayerIndexEntry(layer));
    await this.invalidateStacksReferencingLayer(layer.id);
  }

  async loadLayer(id: string): Promise<PresetLayerV2> {
    return parsePresetLayerV2(await readJsonFile(this.layerPath(id)));
  }

  async listLayerIndex(): Promise<LayerIndexEntryV2[]> {
    return await this.loadLayerIndex();
  }

  async saveStack(stack: StackV2): Promise<void> {
    await writeJsonFileAtomic(this.stackPath(stack.id), stack);
    await this.upsertStackIndex(buildStackIndexEntry({ stack }));
    await this.invalidateStacks([stack.id]);
  }

  async loadStack(id: string): Promise<StackV2> {
    return parseStackV2(await readJsonFile(this.stackPath(id)));
  }

  async listStackIndex(): Promise<StackIndexEntryV2[]> {
    return await this.loadStackIndex();
  }

  async loadStackIndexEntry(id: string): Promise<StackIndexEntryV2 | undefined> {
    const items = await this.loadStackIndex();
    return items.find((item) => item.id === id);
  }

  async saveArtifact(artifact: StackArtifactV2): Promise<void> {
    await writeJsonFileAtomic(this.artifactPath(artifact.key), artifact);

    const stackIndexEntry = await this.loadStackIndexEntry(artifact.stackId);
    if (!stackIndexEntry) {
      throw new Error(`SillyClaw v2 store: missing stack index for artifact target: ${artifact.stackId}`);
    }

    await this.upsertStackIndex(
      {
        ...stackIndexEntry,
        updatedAt: new Date().toISOString(),
        artifactKey: artifact.key,
        placementSummary: summarizePlacementV2(artifact),
        diagnosticsSummary: artifact.diagnosticsSummary,
      },
    );
  }

  async loadArtifact(key: string): Promise<StackArtifactV2> {
    return parseStackArtifactV2(await readJsonFile(this.artifactPath(key)));
  }

  async listArtifactKeys(): Promise<string[]> {
    const dir = this.artifactsDir();
    if (!(await fileExists(dir))) {
      return [];
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.parse(entry.name).name)
      .sort((left, right) => left.localeCompare(right));
  }

  async saveImportedBundle(bundle: ImportedPresetBundleV2): Promise<void> {
    await this.saveLayer(bundle.layer);
    for (const stack of bundle.stacks) {
      await this.saveStack(stack);
    }
  }

  private async loadLayerIndex(): Promise<LayerIndexEntryV2[]> {
    const indexPath = this.layersIndexPath();
    if (!(await fileExists(indexPath))) {
      return [];
    }
    return parseIndexArray(await readJsonFile(indexPath), "layers index", parseLayerIndexEntryV2);
  }

  private async loadStackIndex(): Promise<StackIndexEntryV2[]> {
    const indexPath = this.stacksIndexPath();
    if (!(await fileExists(indexPath))) {
      return [];
    }
    return parseIndexArray(await readJsonFile(indexPath), "stacks index", parseStackIndexEntryV2);
  }

  private async upsertLayerIndex(entry: LayerIndexEntryV2): Promise<void> {
    const items = await this.loadLayerIndex();
    await writeJsonFileAtomic(this.layersIndexPath(), upsertEntry(items, entry));
  }

  private async upsertStackIndex(entry: StackIndexEntryV2): Promise<void> {
    const items = await this.loadStackIndex();
    await writeJsonFileAtomic(this.stacksIndexPath(), upsertEntry(items, entry));
  }

  private async invalidateStacksReferencingLayer(layerId: string): Promise<void> {
    const items = await this.loadStackIndex();
    const affectedStackIds = items
      .filter((item) => item.layerIds.includes(layerId))
      .map((item) => item.id);
    await this.invalidateStacks(affectedStackIds);
  }

  private async invalidateStacks(stackIds: string[]): Promise<void> {
    const targetIds = [...new Set(stackIds)];
    if (targetIds.length === 0) {
      return;
    }

    const stackIndex = await this.loadStackIndex();
    const nextStackIndex = stackIndex.map((item) =>
      targetIds.includes(item.id)
        ? {
            ...item,
            artifactKey: undefined,
            placementSummary: undefined,
            diagnosticsSummary: [],
          }
        : item,
    );
    await writeJsonFileAtomic(this.stacksIndexPath(), nextStackIndex);
  }
}

function buildLayerIndexEntry(layer: PresetLayerV2): LayerIndexEntryV2 {
  return {
    id: layer.id,
    name: layer.name,
    sourceKind: layer.source?.kind,
    updatedAt: new Date().toISOString(),
    fragmentCount: layer.fragments.length,
    scopeCount: layer.scopes.length,
    absoluteCount: layer.fragments.filter((fragment) => fragment.insertion.kind === "absolute").length,
    regexCount: layer.regexRules.length,
    enabledRegexCount: layer.regexRules.filter((rule) => !rule.disabled).length,
    placementSummary: [...new Set(layer.scopes.map((scope) => scope.preferredRenderer))],
    hash: sha256OfJson(layer),
  };
}

function buildStackIndexEntry(params: {
  stack: StackV2;
  artifactKey?: string;
  diagnosticsSummary?: DiagnosticCodeV2[];
}): StackIndexEntryV2 {
  return {
    id: params.stack.id,
    name: params.stack.name,
    layerIds: params.stack.layers.map((layer) => layer.layerId),
    scopeIds: params.stack.layers.map((layer) => layer.scopeId),
    updatedAt: new Date().toISOString(),
    hash: sha256OfJson(params.stack),
    artifactKey: params.artifactKey,
    preferredRenderer: params.stack.preferredRenderer,
    diagnosticsSummary: params.diagnosticsSummary ?? [],
  };
}

function parseIndexArray<T>(raw: unknown, label: string, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(raw)) {
    throw new Error(`SillyClaw v2 store: expected ${label} to be an array.`);
  }
  return raw.map((item) => parse(item));
}

function upsertEntry<T extends { id: string; name: string }>(items: T[], entry: T): T[] {
  const withoutExisting = items.filter((item) => item.id !== entry.id);
  return [...withoutExisting, entry].sort((left, right) => left.name.localeCompare(right.name));
}
