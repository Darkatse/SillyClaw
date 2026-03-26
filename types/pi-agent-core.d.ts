declare module "@mariozechner/pi-agent-core" {
  type AgentUsage = {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      total?: number;
    };
  };

  type AgentMessageBase = {
    timestamp?: number;
    name?: string;
    customType?: string;
    display?: boolean;
    details?: Record<string, unknown>;
    stopReason?: string;
    usage?: AgentUsage;
    api?: string;
    provider?: string;
    model?: string;
    errorMessage?: string;
  };

  type AssistantContentBlock = {
    type: string;
    text?: string;
    thinking?: string;
    [key: string]: unknown;
  };

  export type AgentMessage =
    | (AgentMessageBase & {
        role: "assistant";
        content: AssistantContentBlock[];
      })
    | (AgentMessageBase & {
        role: "system" | "user" | "tool" | "custom";
        content: unknown;
      });
}
