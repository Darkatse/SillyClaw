import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { delegateCompactionToRuntime } from "openclaw/plugin-sdk/core";
import type {
  AssembleResult,
  CompactResult,
  ContextEngine,
  ContextEngineInfo,
  IngestResult,
} from "openclaw/plugin-sdk";
import type { SillyClawV2Runtime } from "./runtime.js";

export function createSillyClawContextEngine(params: {
  runtime: SillyClawV2Runtime;
}): ContextEngine {
  return new SillyClawContextEngine(params.runtime);
}

class SillyClawContextEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: "sillyclaw",
    name: "SillyClaw Context Engine",
    version: "0.3.0",
    ownsCompaction: false,
  };

  constructor(private readonly runtime: SillyClawV2Runtime) {}

  async ingest(_params: {
    sessionId: string;
    sessionKey?: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    return { ingested: false };
  }

  async assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    tokenBudget?: number;
    model?: string;
    prompt?: string;
  }): Promise<AssembleResult> {
    return {
      messages: await this.runtime.buildContextMessages({
        sessionKey: params.sessionKey,
        messages: params.messages,
      }),
      estimatedTokens: 0,
    };
  }

  async compact(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: "budget" | "threshold";
    customInstructions?: string;
    runtimeContext?: Record<string, unknown>;
  }): Promise<CompactResult> {
    return await delegateCompactionToRuntime(params);
  }
}
