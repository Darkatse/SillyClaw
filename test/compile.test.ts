import { describe, expect, it } from "vitest";
import { compileStackToPromptInjection } from "../src/compile.js";
import type { PresetLayer, PresetStack } from "../src/types.js";

describe("compileStackToPromptInjection", () => {
  it("applies layers in stack order and blocks in per-layer order", () => {
    const layerA: PresetLayer = {
      schemaVersion: 1,
      id: "layer-a",
      name: "A",
      blocks: [
        { target: "system.prepend", order: 10, text: "A10" },
        { target: "system.prepend", order: 5, text: "A5" },
        { target: "user.prepend", order: 1, text: "Au1" },
      ],
    };
    const layerB: PresetLayer = {
      schemaVersion: 1,
      id: "layer-b",
      name: "B",
      blocks: [
        { target: "system.prepend", order: 0, text: "B0" },
        { target: "user.prepend", order: 2, text: "Bu2" },
      ],
    };
    const stack: PresetStack = { schemaVersion: 1, id: "stack", name: "S", layers: [layerA.id, layerB.id] };

    const result = compileStackToPromptInjection({ stack, layers: [layerA, layerB] });
    expect(result.injection.prependSystemContext).toBe("A5\n\nA10\n\nB0");
    expect(result.injection.prependContext).toBe("Au1\n\nBu2");
  });

  it("skips disabled and whitespace-only blocks", () => {
    const layer: PresetLayer = {
      schemaVersion: 1,
      id: "layer",
      name: "L",
      blocks: [
        { target: "system.prepend", order: 0, text: "   " },
        { target: "system.prepend", order: 1, text: "OK" },
        { target: "system.prepend", order: 2, text: "NO", enabled: false },
      ],
    };
    const stack: PresetStack = { schemaVersion: 1, id: "stack", name: "S", layers: [layer.id] };

    const result = compileStackToPromptInjection({ stack, layers: [layer] });
    expect(result.injection.prependSystemContext).toBe("OK");
  });

  it("substitutes {{char}}/{{user}} when mapped and reports missing mappings otherwise", () => {
    const layer: PresetLayer = {
      schemaVersion: 1,
      id: "layer",
      name: "L",
      blocks: [
        { target: "system.prepend", order: 0, text: "Hello {{char}} + {{user}}." },
        { target: "user.prepend", order: 1, text: "User={{user}}, Char={{char}}, Other={{other}}." },
      ],
    };
    const stackOk: PresetStack = {
      schemaVersion: 1,
      id: "stack",
      name: "S",
      layers: [layer.id],
      macros: { char: "Alice", user: "Bob" },
    };

    const ok = compileStackToPromptInjection({ stack: stackOk, layers: [layer] });
    expect(ok.injection.prependSystemContext).toBe("Hello Alice + Bob.");
    expect(ok.injection.prependContext).toBe("User=Bob, Char=Alice, Other={{other}}.");
    expect(ok.missingMacros).toEqual([]);

    const stackMissing: PresetStack = { ...stackOk, macros: { user: "Bob" } };
    const missing = compileStackToPromptInjection({ stack: stackMissing, layers: [layer] });
    expect(missing.injection.prependSystemContext).toBe("Hello {{char}} + Bob.");
    expect(missing.missingMacros).toEqual(["char"]);
  });

  it("throws when an enabled system.append block exists (deferred feature)", () => {
    const layer: PresetLayer = {
      schemaVersion: 1,
      id: "layer",
      name: "L",
      blocks: [{ target: "system.append", order: 0, text: "APPEND" }],
    };
    const stack: PresetStack = { schemaVersion: 1, id: "stack", name: "S", layers: [layer.id] };

    expect(() => compileStackToPromptInjection({ stack, layers: [layer] })).toThrow(
      /system\.append blocks are not supported/i,
    );
  });

  it("throws when a stack references a missing layer", () => {
    const stack: PresetStack = { schemaVersion: 1, id: "stack", name: "S", layers: ["missing"] };
    expect(() => compileStackToPromptInjection({ stack, layers: [] })).toThrow(/missing preset layer/i);
  });
});

