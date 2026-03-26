import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  EngineAbsoluteInstructionV2,
  EngineArtifactV2,
  EngineMessageInstructionV2,
  PromptRoleV2,
  RenderPlanV2,
} from "./model.js";

export const SILLYCLAW_V2_CONTEXT_ENGINE_RENDERER_VERSION = "phase3";

const ABSOLUTE_ROLE_ORDER: PromptRoleV2[] = ["system", "user", "assistant"];

export function renderContextEngineArtifactV2(plan: RenderPlanV2): EngineArtifactV2 {
  const beforeHistory: EngineMessageInstructionV2[] = [];
  const afterHistory: EngineMessageInstructionV2[] = [];
  const absoluteGroups = new Map<string, EngineAbsoluteInstructionV2>();

  for (const insertion of plan.engineInsertions) {
    const entry = insertion.entry;
    const content = entry.contentTemplate.trim();
    if (!content) {
      continue;
    }

    if (entry.insertion.kind === "absolute") {
      const key = `${entry.insertion.depth}:${entry.insertion.order}:${entry.role}`;
      const existing = absoluteGroups.get(key);
      if (existing) {
        existing.entryKeys.push(entry.key);
        existing.content = `${existing.content}\n${content}`;
      } else {
        absoluteGroups.set(key, {
          entryKeys: [entry.key],
          role: entry.role,
          content,
          depth: entry.insertion.depth,
          order: entry.insertion.order,
        });
      }
      continue;
    }

    const instruction = {
      entryKeys: [entry.key],
      role: entry.role,
      content,
    } satisfies EngineMessageInstructionV2;

    if (entry.historySegment === "after-history") {
      afterHistory.push(instruction);
    } else {
      beforeHistory.push(instruction);
    }
  }

  return {
    beforeHistory,
    afterHistory,
    absolute: [...absoluteGroups.values()].sort(compareAbsoluteInstructions),
  };
}

export function assembleContextEngineMessagesV2(params: {
  artifact?: EngineArtifactV2;
  messages: AgentMessage[];
}): AgentMessage[] {
  const artifact = params.artifact;
  if (!artifact) {
    return params.messages;
  }

  const historyWithAbsolute = applyAbsoluteInstructions(params.messages, artifact.absolute);
  if (
    artifact.beforeHistory.length === 0 &&
    artifact.afterHistory.length === 0 &&
    historyWithAbsolute === params.messages
  ) {
    return params.messages;
  }

  const baseTimestamp = Date.now();
  return [
    ...renderMessageInstructions(artifact.beforeHistory, baseTimestamp),
    ...historyWithAbsolute,
    ...renderMessageInstructions(
      artifact.afterHistory,
      baseTimestamp + artifact.beforeHistory.length,
    ),
  ];
}

function applyAbsoluteInstructions(
  messages: AgentMessage[],
  instructions: EngineAbsoluteInstructionV2[],
): AgentMessage[] {
  if (instructions.length === 0) {
    return messages;
  }

  const byDepth = groupAbsoluteInstructionsByDepth(instructions);
  const maxDepth = Math.max(...byDepth.keys());
  const working = messages.slice().reverse();
  let totalInsertedMessages = 0;
  let timestamp = Date.now();

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const depthInstructions = byDepth.get(depth);
    if (!depthInstructions || depthInstructions.length === 0) {
      continue;
    }

    const roleMessages: AgentMessage[] = [];
    const orders = [...new Set(depthInstructions.map((instruction) => instruction.order))].sort(
      (left, right) => right - left,
    );

    for (const order of orders) {
      for (const role of ABSOLUTE_ROLE_ORDER) {
        const instruction = depthInstructions.find(
          (candidate) => candidate.order === order && candidate.role === role,
        );
        if (!instruction) {
          continue;
        }
        roleMessages.push(
          toAgentMessage(
            {
              entryKeys: instruction.entryKeys,
              role: instruction.role,
              content: instruction.content,
            },
            timestamp,
          ),
        );
        timestamp += 1;
      }
    }

    if (roleMessages.length === 0) {
      continue;
    }

    const injectIndex = depth + totalInsertedMessages;
    working.splice(injectIndex, 0, ...roleMessages);
    totalInsertedMessages += roleMessages.length;
  }

  return working.reverse();
}

function groupAbsoluteInstructionsByDepth(
  instructions: EngineAbsoluteInstructionV2[],
): Map<number, EngineAbsoluteInstructionV2[]> {
  const byDepth = new Map<number, EngineAbsoluteInstructionV2[]>();
  for (const instruction of instructions) {
    const bucket = byDepth.get(instruction.depth);
    if (bucket) {
      bucket.push(instruction);
    } else {
      byDepth.set(instruction.depth, [instruction]);
    }
  }
  return byDepth;
}

function renderMessageInstructions(
  instructions: EngineMessageInstructionV2[],
  baseTimestamp: number,
): AgentMessage[] {
  return instructions.map((instruction, index) =>
    toAgentMessage(instruction, baseTimestamp + index),
  );
}

function toAgentMessage(
  instruction: EngineMessageInstructionV2,
  timestamp: number,
): AgentMessage {
  if (instruction.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "text", text: instruction.content }],
      timestamp,
      usage: createZeroUsageSnapshot(),
    } as AgentMessage;
  }

  return {
    role: instruction.role,
    content: instruction.content,
    timestamp,
  } as AgentMessage;
}

function createZeroUsageSnapshot() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function compareAbsoluteInstructions(
  left: EngineAbsoluteInstructionV2,
  right: EngineAbsoluteInstructionV2,
): number {
  if (left.depth !== right.depth) {
    return left.depth - right.depth;
  }
  if (left.order !== right.order) {
    return right.order - left.order;
  }
  return ABSOLUTE_ROLE_ORDER.indexOf(left.role) - ABSOLUTE_ROLE_ORDER.indexOf(right.role);
}
