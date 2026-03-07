import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { resolveSillyClawConfig } from "./src/config.js";
import { createSillyClawRuntime } from "./src/runtime.js";
import { registerSillyClawCli } from "./src/cli.js";

const plugin = {
  id: "sillyclaw",
  name: "SillyClaw",
  description: "SillyTavern preset importer + roleplay prompt overlays for OpenClaw.",
  register(api: OpenClawPluginApi) {
    const config = resolveSillyClawConfig({ api });
    const runtime = createSillyClawRuntime({ api, config });

    registerSillyClawCli({ api, runtime });

    api.on(
      "before_prompt_build",
      async (_event, ctx) => runtime.buildPromptInjection({ agentId: ctx.agentId, sessionKey: ctx.sessionKey }),
      {
      // Prefer to run after core prompt assembly and other “tool guidance” plugins.
      priority: -10,
      },
    );
  },
};

export default plugin;
