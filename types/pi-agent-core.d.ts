declare module "@mariozechner/pi-agent-core" {
  export type AgentMessage = {
    role: "system" | "user" | "assistant" | "tool" | "custom";
    content: unknown;
    timestamp?: number;
    name?: string;
    customType?: string;
    display?: boolean;
    details?: Record<string, unknown>;
    stopReason?: string;
    usage?: {
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
    api?: string;
    provider?: string;
    model?: string;
    errorMessage?: string;
  };
}
