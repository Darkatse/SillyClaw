declare module "openclaw/plugin-sdk/core" {
  import type { ContextEngineFactory } from "openclaw/plugin-sdk";

  export type OpenClawPluginApi = {
    id: string;
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    logger: {
      debug: (msg: string) => void;
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
    };
    resolvePath: (input: string) => string;
    on: (
      hookName: "before_prompt_build",
      handler: (
        event: { prompt: string; messages: unknown[] },
        ctx: {
          agentId?: string;
          sessionKey?: string;
          sessionId?: string;
          workspaceDir?: string;
          messageProvider?: string;
          trigger?: string;
          channelId?: string;
        },
      ) =>
        | void
        | Promise<void>
        | {
            systemPrompt?: string;
            prependContext?: string;
            prependSystemContext?: string;
            appendSystemContext?: string;
          }
        | Promise<{
            systemPrompt?: string;
            prependContext?: string;
            prependSystemContext?: string;
            appendSystemContext?: string;
          }>,
      opts?: { priority?: number },
    ) => void;
    registerCli: (
      registrar: (ctx: { program: unknown; config: unknown; workspaceDir?: string; logger: unknown }) =>
        | void
        | Promise<void>,
      opts?: { commands?: string[] },
    ) => void;
    registerContextEngine: (id: string, factory: ContextEngineFactory) => void;
  };

  export function delegateCompactionToRuntime(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: "budget" | "threshold";
    customInstructions?: string;
    runtimeContext?: Record<string, unknown>;
  }): Promise<import("openclaw/plugin-sdk").CompactResult>;
}
