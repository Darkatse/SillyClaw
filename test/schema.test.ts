import { describe, expect, it } from "vitest";
import { parsePresetLayer, parsePresetStack, parseSillyClawState } from "../src/schema.js";

describe("schema parsers", () => {
  it("defaults schemaVersion to 1 when missing", () => {
    const state = parseSillyClawState({});
    expect(state).toEqual({ schemaVersion: 1, defaultStackId: undefined, stackByAgentId: {}, stackBySessionKey: {} });
  });

  it("throws on unsupported schemaVersion", () => {
    expect(() => parseSillyClawState({ schemaVersion: 2 })).toThrow(/unsupported schemaVersion/i);
  });

  it("parses a minimal preset layer (schemaVersion omitted)", () => {
    const layer = parsePresetLayer({
      id: "p1",
      name: "Preset",
      blocks: [{ target: "system.prepend", order: 0, text: "Hi" }],
    });

    expect(layer.schemaVersion).toBe(1);
    expect(layer.blocks).toHaveLength(1);
    expect(layer.blocks[0]?.enabled).toBeUndefined();
  });

  it("throws on invalid preset block target", () => {
    expect(() =>
      parsePresetLayer({
        id: "p1",
        name: "Preset",
        blocks: [{ target: "bad.target", order: 0, text: "Hi" }],
      }),
    ).toThrow(/invalid .*target/i);
  });

  it("throws when optional fields are present with the wrong type", () => {
    expect(() =>
      parseSillyClawState({
        defaultStackId: 123,
      }),
    ).toThrow(/defaultStackId.*string/i);
  });

  it("throws when a preset stack contains non-string layer ids", () => {
    expect(() =>
      parsePresetStack({
        id: "s1",
        name: "Stack",
        layers: ["ok", 123],
      }),
    ).toThrow(/layers\[1\].*string/i);
  });
});
