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
  };
}
