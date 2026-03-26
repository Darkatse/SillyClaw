import type { PlacementSummaryV2, StackArtifactV2 } from "./model.js";

export function summarizePlacementV2(artifact: Pick<StackArtifactV2, "hookArtifact" | "engineArtifact">): PlacementSummaryV2 {
  return {
    hook: {
      prependSystem: artifact.hookArtifact?.entryKeys.prependSystem.length ?? 0,
      appendSystem: artifact.hookArtifact?.entryKeys.appendSystem.length ?? 0,
      prependContext: artifact.hookArtifact?.entryKeys.prependContext.length ?? 0,
    },
    engine: {
      beforeHistory: artifact.engineArtifact?.beforeHistory.length ?? 0,
      afterHistory: artifact.engineArtifact?.afterHistory.length ?? 0,
      absolute: artifact.engineArtifact?.absolute.length ?? 0,
    },
  };
}
