import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { SillyClawConfig } from "./types.js";

function resolveOpenClawStateDir(): string {
  const env = process.env.OPENCLAW_STATE_DIR?.trim();
  if (env) {
    return env;
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveSillyClawConfig(params: { api: OpenClawPluginApi }): SillyClawConfig {
  const raw = params.api.pluginConfig ?? {};
  const dataDirInput = typeof raw.dataDir === "string" ? raw.dataDir.trim() : "";
  const debug = raw.debug === true;

  const defaultDataDir = path.join(resolveOpenClawStateDir(), "sillyclaw");
  const dataDir = dataDirInput ? params.api.resolvePath(dataDirInput) : defaultDataDir;

  return { dataDir, debug };
}

