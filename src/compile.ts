import type { MacroMapping, PresetBlock, PresetLayer, PresetStack, PromptInjection } from "./types.js";

export type CompileResult = {
  injection: PromptInjection;
  missingMacros: Array<keyof MacroMapping>;
};

export function compileStackToPromptInjection(params: {
  stack: PresetStack;
  layers: PresetLayer[];
}): CompileResult {
  const layersById = new Map(params.layers.map((l) => [l.id, l]));

  const buckets: Record<Exclude<PresetBlock["target"], "system.append">, string[]> = {
    "system.prepend": [],
    "user.prepend": [],
  };

  for (const layerId of params.stack.layers) {
    const layer = layersById.get(layerId);
    if (!layer) {
      throw new Error(`SillyClaw: stack references missing preset layer: ${layerId}`);
    }

    const enabledBlocks = layer.blocks.filter((b) => b.enabled !== false).slice();
    enabledBlocks.sort((a, b) => a.order - b.order);

    for (const block of enabledBlocks) {
      if (!block.text.trim()) {
        continue;
      }
      if (block.target === "system.append") {
        throw new Error("SillyClaw: system.append blocks are not supported yet (appendSystemContext is deferred).");
      }
      buckets[block.target].push(block.text);
    }
  }

  const injection: PromptInjection = {
    prependSystemContext: joinBucket(buckets["system.prepend"]),
    prependContext: joinBucket(buckets["user.prepend"]),
  };

  if (!injection.prependSystemContext) {
    delete injection.prependSystemContext;
  }
  if (!injection.prependContext) {
    delete injection.prependContext;
  }

  const macros = params.stack.macros ?? {};
  const missing = new Set<keyof MacroMapping>();

  if (injection.prependSystemContext) {
    const r = substituteMacros(injection.prependSystemContext, macros);
    injection.prependSystemContext = r.text;
    for (const m of r.missing) missing.add(m);
  }
  if (injection.prependContext) {
    const r = substituteMacros(injection.prependContext, macros);
    injection.prependContext = r.text;
    for (const m of r.missing) missing.add(m);
  }

  return { injection, missingMacros: [...missing] };
}

function joinBucket(parts: string[]): string {
  return parts.join("\n\n");
}

function substituteMacros(text: string, macros: MacroMapping): { text: string; missing: Set<keyof MacroMapping> } {
  const missing = new Set<keyof MacroMapping>();
  const rendered = text.replace(/\{\{(char|user)\}\}/g, (m: string, key: string) => {
    const k = key as keyof MacroMapping;
    const value = macros[k];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    missing.add(k);
    return m;
  });
  return { text: rendered, missing };
}
