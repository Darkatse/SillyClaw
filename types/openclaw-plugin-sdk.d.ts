declare module "openclaw/plugin-sdk" {
  import type { AgentMessage } from "@mariozechner/pi-agent-core";
  import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

  export type AssembleResult = {
    messages: AgentMessage[];
    estimatedTokens: number;
    systemPromptAddition?: string;
  };

  export type CompactResult = {
    ok: boolean;
    compacted: boolean;
    reason?: string;
    result?: {
      summary?: string;
      firstKeptEntryId?: string;
      tokensBefore: number;
      tokensAfter?: number;
      details?: unknown;
    };
  };

  export type IngestResult = {
    ingested: boolean;
  };

  export type ContextEngineInfo = {
    id: string;
    name: string;
    version?: string;
    ownsCompaction?: boolean;
  };

  export interface ContextEngine {
    readonly info: ContextEngineInfo;
    ingest(params: {
      sessionId: string;
      sessionKey?: string;
      message: AgentMessage;
      isHeartbeat?: boolean;
    }): Promise<IngestResult>;
    assemble(params: {
      sessionId: string;
      sessionKey?: string;
      messages: AgentMessage[];
      tokenBudget?: number;
      model?: string;
      prompt?: string;
    }): Promise<AssembleResult>;
    compact(params: {
      sessionId: string;
      sessionKey?: string;
      sessionFile: string;
      tokenBudget?: number;
      force?: boolean;
      currentTokenCount?: number;
      compactionTarget?: "budget" | "threshold";
      customInstructions?: string;
      runtimeContext?: Record<string, unknown>;
    }): Promise<CompactResult>;
  }

  export type ContextEngineFactory = () => ContextEngine | Promise<ContextEngine>;

  export { delegateCompactionToRuntime } from "openclaw/plugin-sdk/core";
  export type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
}
