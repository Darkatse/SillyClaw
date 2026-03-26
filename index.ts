import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { resolveSillyClawConfig } from "./src/config.js";
import { registerSillyClawCli } from "./src/cli.js";
import { createSillyClawContextEngine } from "./src/v2/context-engine.js";
import { createSillyClawV2Runtime } from "./src/v2/runtime.js";

const plugin = {
  id: "sillyclaw",
  name: "SillyClaw",
  description: "SillyTavern preset importer + roleplay prompt overlays for OpenClaw.",
  register(api: OpenClawPluginApi) {
    const config = resolveSillyClawConfig({ api });
    const contextEngineSelected =
      isRecord(api.config) &&
      isRecord(api.config.plugins) &&
      isRecord(api.config.plugins.slots) &&
      api.config.plugins.slots.contextEngine === "sillyclaw";
    const runtime = createSillyClawV2Runtime({
      dataDir: config.dataDir,
      debug: config.debug,
      logger: api.logger,
    });

    registerSillyClawCli({ api, runtime });
    api.registerContextEngine("sillyclaw", () => createSillyClawContextEngine({ runtime }));

    api.on(
      "before_prompt_build",
      async (_event, ctx) =>
        runtime.buildPromptInjection({
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          allowAgentFallback: !contextEngineSelected,
        }),
      {
        // Prefer to run after core prompt assembly and other “tool guidance” plugins.
        priority: -10,
      },
    );
  },
};

export default plugin;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
