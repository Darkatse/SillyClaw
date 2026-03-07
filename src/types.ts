export type SchemaVersion = 1;

export type PresetBlockTarget = "system.prepend" | "system.append" | "user.prepend";

export type PresetBlockMerge = "concat" | "replace";

export type PresetBlock = {
  target: PresetBlockTarget;
  order: number;
  text: string;
  enabled?: boolean;
  /**
   * Optional key used for stack-layer overrides.
   * If omitted, the block is treated as always-concatenated.
   */
  blockKey?: string;
  merge?: PresetBlockMerge;
};

export type PresetLayerSource =
  | {
      kind: "sillytavern";
      fileName?: string;
      fileHashSha256?: string;
      importedAt: string;
    }
  | {
      kind: "manual";
      createdAt: string;
    };

export type PresetLayer = {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  source?: PresetLayerSource;
  blocks: PresetBlock[];
};

export type MacroMapping = {
  char?: string;
  user?: string;
};

export type PresetStack = {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  layers: string[];
  macros?: MacroMapping;
};

export type SillyClawState = {
  schemaVersion: SchemaVersion;
  /**
   * Default stack used when no per-agent selection exists.
   * This is SillyClaw-managed runtime state, not OpenClaw config.
   */
  defaultStackId?: string;
  /** Per-agent active stack selection. */
  stackByAgentId?: Record<string, string>;
  /** Per-session active stack selection (takes precedence over per-agent/default). */
  stackBySessionKey?: Record<string, string>;
};

export type SillyClawConfig = {
  dataDir: string;
  debug: boolean;
};

export type PromptInjection = {
  prependSystemContext?: string;
  prependContext?: string;
  appendSystemContext?: string;
};
